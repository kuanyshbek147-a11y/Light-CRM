import { Router } from "express";
import { AuthRequest } from "./auth";
import { query } from "./db";

export const contactsRouter = Router();

contactsRouter.get("/", async (req: AuthRequest, res) => {
  const q = String((req.query.q as string) || "").trim();
  const needle = q ? `%${q.toLowerCase()}%` : null;

  const rows = await query<{
    id: string;
    name: string;
    phone: string;
    city: string | null;
    client_type: string | null;
    category: string | null;
    channels: string;
    conversations_count: string;
    deals_count: string;
    last_activity_at: string | null;
  }>(
    `SELECT ct.id, ct.name, ct.phone, ct.city, ct.client_type, ct.category,
            COALESCE(string_agg(DISTINCT c.channel, ','), '') AS channels,
            COUNT(DISTINCT c.id)::text AS conversations_count,
            COUNT(DISTINCT d.id)::text AS deals_count,
            MAX(GREATEST(c.updated_at, ct.created_at)) AS last_activity_at
     FROM contacts ct
     LEFT JOIN conversations c ON c.contact_id = ct.id
     LEFT JOIN deals d ON d.conversation_id = c.id
     WHERE ct.workspace_id = $1
       AND ($2::text IS NULL OR lower(ct.name) LIKE $2 OR lower(COALESCE(ct.phone, '')) LIKE $2
            OR lower(COALESCE(ct.city, '')) LIKE $2)
     GROUP BY ct.id
     ORDER BY MAX(GREATEST(c.updated_at, ct.created_at)) DESC NULLS LAST
     LIMIT 200`,
    [req.user?.workspaceId, needle]
  );

  res.json(
    rows.map((row) => ({
      ...row,
      channels: row.channels ? row.channels.split(",").filter(Boolean) : [],
      conversations_count: Number(row.conversations_count || 0),
      deals_count: Number(row.deals_count || 0)
    }))
  );
});

contactsRouter.get("/:contactId", async (req: AuthRequest, res) => {
  const contactRows = await query<{
    id: string;
    name: string;
    phone: string;
    city: string | null;
    inquiry_reason: string | null;
    client_type: string | null;
    category: string | null;
    created_at: string;
  }>(
    `SELECT id, name, phone, city, inquiry_reason, client_type, category, created_at
     FROM contacts
     WHERE id = $1 AND workspace_id = $2
     LIMIT 1`,
    [req.params.contactId, req.user?.workspaceId]
  );
  const contact = contactRows[0];
  if (!contact) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const conversations = await query<{
    id: string;
    channel: string;
    status: string;
    updated_at: string;
    assigned_manager_id: string | null;
  }>(
    `SELECT id, channel, status, updated_at, assigned_manager_id
     FROM conversations
     WHERE contact_id = $1 AND workspace_id = $2
     ORDER BY updated_at DESC`,
    [req.params.contactId, req.user?.workspaceId]
  );

  const deals = await query<{
    id: string;
    conversation_id: string;
    stage: string;
    amount: string;
    next_step_at: string | null;
    updated_at: string;
  }>(
    `SELECT d.id, d.conversation_id, d.stage, d.amount::text, d.next_step_at, d.updated_at
     FROM deals d
     JOIN conversations c ON c.id = d.conversation_id
     WHERE c.contact_id = $1 AND d.workspace_id = $2
     ORDER BY d.updated_at DESC`,
    [req.params.contactId, req.user?.workspaceId]
  );

  const timeline = await query<{
    id: string;
    kind: string;
    title: string;
    detail: string | null;
    created_at: string;
    conversation_id: string | null;
  }>(
    `(
       SELECT a.id::text AS id,
              'activity' AS kind,
              a.action AS title,
              a.metadata::text AS detail,
              a.created_at,
              a.conversation_id
       FROM activities a
       JOIN conversations c ON c.id = a.conversation_id
       WHERE c.contact_id = $1 AND a.workspace_id = $2
     )
     UNION ALL
     (
       SELECT m.id::text AS id,
              'message' AS kind,
              CASE WHEN m.direction = 'incoming' THEN 'Входящее сообщение' ELSE 'Исходящее сообщение' END AS title,
              left(COALESCE(m.body, ''), 160) AS detail,
              m.created_at,
              m.conversation_id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.contact_id = $1 AND m.workspace_id = $2
     )
     ORDER BY created_at DESC
     LIMIT 80`,
    [req.params.contactId, req.user?.workspaceId]
  );

  res.json({ contact, conversations, deals, timeline });
});

/** Склеить sourceContactId в текущий контакт: все диалоги переезжают сюда. */
contactsRouter.post("/:contactId/merge", async (req: AuthRequest, res) => {
  const sourceContactId = String((req.body as { sourceContactId?: string }).sourceContactId || "").trim();
  const targetContactId = req.params.contactId;
  if (!sourceContactId || sourceContactId === targetContactId) {
    res.status(400).json({ error: "source_contact_required" });
    return;
  }

  const contacts = await query<{ id: string; name: string; phone: string }>(
    `SELECT id, name, phone FROM contacts
     WHERE workspace_id = $1 AND id IN ($2, $3)`,
    [req.user?.workspaceId, targetContactId, sourceContactId]
  );
  if (contacts.length < 2) {
    res.status(404).json({ error: "contact_not_found" });
    return;
  }

  await query(
    `UPDATE conversations
     SET contact_id = $1, updated_at = now()
     WHERE contact_id = $2 AND workspace_id = $3`,
    [targetContactId, sourceContactId, req.user?.workspaceId]
  );

  const target = contacts.find((row) => row.id === targetContactId);
  const source = contacts.find((row) => row.id === sourceContactId);
  if (target && source) {
    const nextPhone = target.phone?.trim() || source.phone || "";
    const nextName = target.name?.trim() || source.name || "";
    await query(
      `UPDATE contacts
       SET phone = $1, name = $2
       WHERE id = $3 AND workspace_id = $4`,
      [nextPhone, nextName, targetContactId, req.user?.workspaceId]
    );
  }

  await query(`DELETE FROM contacts WHERE id = $1 AND workspace_id = $2`, [
    sourceContactId,
    req.user?.workspaceId
  ]);

  await query(
    `INSERT INTO activities (workspace_id, user_id, conversation_id, action, metadata)
     SELECT $1, $2, c.id, 'contact_merged', jsonb_build_object('source_contact_id', $3::text, 'target_contact_id', $4::text)
     FROM conversations c
     WHERE c.contact_id = $4 AND c.workspace_id = $1
     ORDER BY c.updated_at DESC
     LIMIT 1`,
    [req.user?.workspaceId, req.user?.id, sourceContactId, targetContactId]
  );

  res.json({ ok: true, contactId: targetContactId });
});
