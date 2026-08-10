import { Router } from "express";
import { AuthRequest } from "./auth";
import { query } from "./db";

export const tasksRouter = Router();

tasksRouter.get("/", async (req: AuthRequest, res) => {
  const status = String((req.query.status as string) || "open").trim();
  const statusFilter =
    status === "all" ? "" : status === "done" ? "AND t.status = 'done'" : "AND t.status = 'open'";

  const rows = await query<{
    id: string;
    title: string;
    status: string;
    due_at: string | null;
    created_at: string;
    updated_at: string;
    conversation_id: string | null;
    deal_id: string | null;
    owner_user_id: string | null;
    contact_name: string | null;
    channel: string | null;
    deal_stage: string | null;
    owner_name: string | null;
  }>(
    `SELECT t.id, t.title, t.status, t.due_at, t.created_at, t.updated_at,
            t.conversation_id, t.deal_id, t.owner_user_id,
            ct.name AS contact_name, c.channel,
            d.stage AS deal_stage, u.full_name AS owner_name
     FROM tasks t
     LEFT JOIN conversations c ON c.id = t.conversation_id
     LEFT JOIN contacts ct ON ct.id = c.contact_id
     LEFT JOIN deals d ON d.id = t.deal_id
     LEFT JOIN users u ON u.id = t.owner_user_id
     WHERE t.workspace_id = $1
       ${statusFilter}
     ORDER BY
       CASE WHEN t.status = 'open' THEN 0 ELSE 1 END,
       CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END,
       t.due_at ASC NULLS LAST,
       t.created_at DESC`,
    [req.user?.workspaceId]
  );

  res.json(rows);
});

tasksRouter.post("/", async (req: AuthRequest, res) => {
  const { title, dueAt, conversationId, dealId } = req.body as {
    title?: string;
    dueAt?: string | null;
    conversationId?: string | null;
    dealId?: string | null;
  };
  const cleanTitle = (title || "").trim();
  if (!cleanTitle) {
    res.status(400).json({ error: "task_title_required" });
    return;
  }

  let resolvedDealId = dealId || null;
  let resolvedConversationId = conversationId || null;

  if (resolvedConversationId) {
    const conversation = await query<{ id: string; deal_id: string | null }>(
      `SELECT c.id, d.id AS deal_id
       FROM conversations c
       LEFT JOIN deals d ON d.conversation_id = c.id
       WHERE c.id = $1 AND c.workspace_id = $2
       LIMIT 1`,
      [resolvedConversationId, req.user?.workspaceId]
    );
    if (!conversation[0]) {
      res.status(404).json({ error: "conversation_not_found" });
      return;
    }
    if (!resolvedDealId) {
      resolvedDealId = conversation[0].deal_id;
    }
  }

  const inserted = await query(
    `INSERT INTO tasks (workspace_id, conversation_id, deal_id, owner_user_id, title, due_at)
     VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::timestamp)
     RETURNING id, conversation_id, deal_id, owner_user_id, title, status, due_at, created_at, updated_at`,
    [
      req.user?.workspaceId,
      resolvedConversationId,
      resolvedDealId,
      req.user?.id,
      cleanTitle,
      dueAt || ""
    ]
  );

  res.status(201).json(inserted[0]);
});

tasksRouter.patch("/:taskId", async (req: AuthRequest, res) => {
  const { title, status, dueAt } = req.body as {
    title?: string;
    status?: string;
    dueAt?: string | null;
  };
  const cleanTitle = title !== undefined ? String(title).trim() : undefined;
  const cleanStatus = status !== undefined ? String(status).trim() : undefined;
  if (cleanStatus && !["open", "done", "cancelled"].includes(cleanStatus)) {
    res.status(400).json({ error: "invalid_status" });
    return;
  }
  if (cleanTitle !== undefined && !cleanTitle) {
    res.status(400).json({ error: "task_title_required" });
    return;
  }

  const rows = await query(
    `UPDATE tasks
     SET title = COALESCE(NULLIF($1, ''), title),
         status = COALESCE(NULLIF($2, ''), status),
         due_at = CASE
           WHEN $3::text = '__CLEAR__' THEN NULL
           WHEN NULLIF($3, '') IS NULL THEN due_at
           ELSE NULLIF($3, '')::timestamp
         END,
         updated_at = now()
     WHERE id = $4 AND workspace_id = $5
     RETURNING id, conversation_id, deal_id, owner_user_id, title, status, due_at, created_at, updated_at`,
    [
      cleanTitle ?? "",
      cleanStatus ?? "",
      dueAt === null ? "__CLEAR__" : dueAt || "",
      req.params.taskId,
      req.user?.workspaceId
    ]
  );

  if (!rows[0]) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(rows[0]);
});

tasksRouter.delete("/:taskId", async (req: AuthRequest, res) => {
  await query(`DELETE FROM tasks WHERE id = $1 AND workspace_id = $2`, [
    req.params.taskId,
    req.user?.workspaceId
  ]);
  res.status(204).send();
});
