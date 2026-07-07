import { Router } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { AuthRequest } from "./auth";
import { query } from "./db";
import { sendTelegramMessageForConversation } from "./telegram";
import { sendWhatsAppFileForConversation, sendWhatsAppMessageForConversation } from "./whatsapp";

export const conversationsRouter = Router();
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/ogg",
  "audio/ogg; codecs=opus",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/webm",
  "audio/amr",
  "audio/aac",
  "audio/x-m4a",
  "audio/3gpp"
]);

function resolveAttachmentType(mimeType: string): "image" | "video" | "audio" | null {
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  return null;
}

function resolveUploadMimeType(file: Express.Multer.File): string {
  const mime = file.mimetype.toLowerCase();
  if (mime.startsWith("audio/") || mime.startsWith("image/") || mime.startsWith("video/")) {
    return mime;
  }
  const name = file.originalname.toLowerCase();
  if (/\.(ogg|opus)$/.test(name)) {
    return "audio/ogg";
  }
  if (/\.(m4a|aac)$/.test(name)) {
    return "audio/mp4";
  }
  if (/\.(mp3)$/.test(name)) {
    return "audio/mpeg";
  }
  if (/\.(amr|3gp)$/.test(name)) {
    return "audio/amr";
  }
  if (/\.webm$/.test(name) && name.includes("voice")) {
    return "audio/webm";
  }
  if (/\.(png|webp|gif|jpe?g)$/.test(name)) {
    return mime || "image/jpeg";
  }
  if (/\.(mp4|mov)$/.test(name)) {
    return "video/mp4";
  }
  return mime;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniquePrefix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
      cb(null, `${uniquePrefix}-${safeName}`);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.toLowerCase();
    const name = file.originalname.toLowerCase();
    const hasAudioExtension = /\.(ogg|opus|m4a|aac|mp3|webm|amr|3gp|wav)$/.test(name);
    const allowed =
      allowedMimeTypes.has(mime) ||
      mime.startsWith("audio/") ||
      mime.startsWith("image/") ||
      mime.startsWith("video/") ||
      ((mime === "application/octet-stream" || mime === "") && hasAudioExtension);
    cb(null, allowed);
  }
});

conversationsRouter.get("/scripts", async (req: AuthRequest, res) => {
  const rows = await query(
    `SELECT id, title, category, body, created_at
     FROM message_scripts
     WHERE workspace_id = $1
     ORDER BY created_at ASC`,
    [req.user?.workspaceId]
  );

  res.json(rows);
});

conversationsRouter.get("/quick-actions-meta", async (req: AuthRequest, res) => {
  const managers = await query<{ id: string; full_name: string }>(
    `SELECT id, full_name
     FROM users
     WHERE workspace_id = $1 AND role = 'manager' AND is_active = true
     ORDER BY full_name ASC`,
    [req.user?.workspaceId]
  );
  const stages = await query<{ id: string; name: string; position: number }>(
    `SELECT id, name, position
     FROM pipeline_stages
     WHERE workspace_id = $1
     ORDER BY position ASC, created_at ASC`,
    [req.user?.workspaceId]
  );
  res.json({ managers, stages });
});

conversationsRouter.post("/scripts", async (req: AuthRequest, res) => {
  const { title, category, body } = req.body as { title: string; category?: string; body: string };
  const cleanTitle = title.trim();
  const cleanCategory = (category || "").trim();
  const cleanBody = body.trim();

  if (!cleanTitle || !cleanBody) {
    res.status(400).json({ error: "title_and_body_required" });
    return;
  }

  const inserted = await query(
    `INSERT INTO message_scripts (workspace_id, title, category, body, created_by_user_id)
     VALUES ($1, $2, NULLIF($3, ''), $4, $5)
     RETURNING id, title, category, body, created_at`,
    [req.user?.workspaceId, cleanTitle, cleanCategory, cleanBody, req.user?.id]
  );

  res.status(201).json(inserted[0]);
});

conversationsRouter.patch("/scripts/:scriptId", async (req: AuthRequest, res) => {
  const { title, category, body } = req.body as { title: string; category?: string; body: string };
  const cleanTitle = title.trim();
  const cleanCategory = (category || "").trim();
  const cleanBody = body.trim();

  if (!cleanTitle || !cleanBody) {
    res.status(400).json({ error: "title_and_body_required" });
    return;
  }

  const updated = await query(
    `UPDATE message_scripts
     SET title = $1,
         category = NULLIF($2, ''),
         body = $3
     WHERE id = $4 AND workspace_id = $5
     RETURNING id, title, category, body, created_at`,
    [cleanTitle, cleanCategory, cleanBody, req.params.scriptId, req.user?.workspaceId]
  );

  res.json(updated[0] || null);
});

conversationsRouter.delete("/scripts/:scriptId", async (req: AuthRequest, res) => {
  await query(
    `DELETE FROM message_scripts
     WHERE id = $1 AND workspace_id = $2`,
    [req.params.scriptId, req.user?.workspaceId]
  );

  res.status(204).send();
});

conversationsRouter.get("/knowledge-base", async (req: AuthRequest, res) => {
  const rows = await query(
    `SELECT id, title, url, category, summary, created_at
     FROM knowledge_articles
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [req.user?.workspaceId]
  );

  res.json(rows);
});

conversationsRouter.post("/knowledge-base", async (req: AuthRequest, res) => {
  const { title, url, category, summary } = req.body as {
    title: string;
    url: string;
    category?: string;
    summary?: string;
  };
  const cleanTitle = title.trim();
  const cleanUrl = url.trim();
  const cleanCategory = (category || "").trim();
  const cleanSummary = (summary || "").trim();

  if (!cleanTitle || !cleanUrl) {
    res.status(400).json({ error: "title_and_url_required" });
    return;
  }

  const inserted = await query(
    `INSERT INTO knowledge_articles (workspace_id, title, url, category, summary, created_by_user_id)
     VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6)
     RETURNING id, title, url, category, summary, created_at`,
    [req.user?.workspaceId, cleanTitle, cleanUrl, cleanCategory, cleanSummary, req.user?.id]
  );

  res.status(201).json(inserted[0]);
});

conversationsRouter.patch("/knowledge-base/:articleId", async (req: AuthRequest, res) => {
  const { title, url, category, summary } = req.body as {
    title: string;
    url: string;
    category?: string;
    summary?: string;
  };
  const cleanTitle = title.trim();
  const cleanUrl = url.trim();
  const cleanCategory = (category || "").trim();
  const cleanSummary = (summary || "").trim();

  if (!cleanTitle || !cleanUrl) {
    res.status(400).json({ error: "title_and_url_required" });
    return;
  }

  const updated = await query(
    `UPDATE knowledge_articles
     SET title = $1,
         url = $2,
         category = NULLIF($3, ''),
         summary = NULLIF($4, '')
     WHERE id = $5 AND workspace_id = $6
     RETURNING id, title, url, category, summary, created_at`,
    [cleanTitle, cleanUrl, cleanCategory, cleanSummary, req.params.articleId, req.user?.workspaceId]
  );

  res.json(updated[0] || null);
});

conversationsRouter.delete("/knowledge-base/:articleId", async (req: AuthRequest, res) => {
  await query(
    `DELETE FROM knowledge_articles
     WHERE id = $1 AND workspace_id = $2`,
    [req.params.articleId, req.user?.workspaceId]
  );

  res.status(204).send();
});

conversationsRouter.get("/", async (req: AuthRequest, res) => {
  const {
    q = "",
    managerId = "",
    stage = "",
    city = "",
    inquiryReason = "",
    clientType = "",
    category = "",
    priority = "",
    attention = ""
  } = req.query as Record<string, string>;
  const rows = await query(
    `SELECT c.id, c.contact_id, c.assigned_manager_id, c.channel, c.status, c.priority, c.first_response_due_at, c.updated_at,
            ct.name AS contact_name, ct.phone, ct.city, ct.inquiry_reason, ct.client_type, ct.category,
            ct.channel AS contact_channel, ct.external_id AS contact_external_id, ct.is_group,
            d.id AS deal_id, d.stage, d.amount,
            m.body AS last_message_body, m.direction AS last_message_direction, m.created_at AS last_message_at,
            COALESCE(unread.unread_count, 0) AS unread_count,
            COALESCE(sla_follow_up.has_sla_follow_up, false) AS has_sla_follow_up,
            (COALESCE(unread.unread_count, 0) > 0 AND c.first_response_due_at IS NOT NULL AND c.first_response_due_at < now()) AS sla_overdue,
            (
              c.status = 'open'
              AND COALESCE(unread.unread_count, 0) > 0
              AND c.first_response_due_at IS NOT NULL
              AND c.first_response_due_at < now()
            ) AS sla_escalated
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     LEFT JOIN deals d ON d.conversation_id = c.id
     LEFT JOIN LATERAL (
       SELECT body, direction, created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
     ) m ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS unread_count
       FROM messages mi
       WHERE mi.conversation_id = c.id
         AND mi.direction = 'incoming'
         AND mi.created_at > COALESCE((
           SELECT MAX(mo.created_at)
           FROM messages mo
           WHERE mo.conversation_id = c.id
             AND mo.direction = 'outgoing'
         ), '1970-01-01'::timestamp)
     ) unread ON true
     LEFT JOIN LATERAL (
       SELECT EXISTS (
         SELECT 1
         FROM tasks t
         WHERE t.workspace_id = c.workspace_id
           AND t.conversation_id = c.id
           AND t.status = 'open'
           AND t.title = 'SLA follow-up'
       ) AS has_sla_follow_up
     ) sla_follow_up ON true
     WHERE c.workspace_id = $1
       AND ($2 = '' OR LOWER(ct.name) LIKE LOWER('%' || $2 || '%') OR ct.phone LIKE '%' || $2 || '%')
       AND (NULLIF($3, '') IS NULL OR c.assigned_manager_id = NULLIF($3, '')::uuid)
       AND ($4 = '' OR d.stage = $4)
       AND ($5 = '' OR LOWER(COALESCE(ct.city, '')) = LOWER($5))
       AND ($6 = '' OR LOWER(COALESCE(ct.inquiry_reason, '')) = LOWER($6))
       AND ($7 = '' OR LOWER(COALESCE(ct.client_type, '')) = LOWER($7))
       AND ($8 = '' OR LOWER(COALESCE(ct.category, '')) = LOWER($8))
       AND ($9 = '' OR c.priority = $9)
       AND (
         $10 = ''
         OR ($10 = 'unread' AND COALESCE(unread.unread_count, 0) > 0)
         OR ($10 = 'overdue' AND COALESCE(unread.unread_count, 0) > 0 AND c.first_response_due_at IS NOT NULL AND c.first_response_due_at < now())
         OR (
           $10 = 'escalated'
           AND c.status = 'open'
           AND COALESCE(unread.unread_count, 0) > 0
           AND c.first_response_due_at IS NOT NULL
           AND c.first_response_due_at < now()
         )
       )
     ORDER BY c.updated_at DESC`,
    [req.user?.workspaceId, q, managerId, stage, city, inquiryReason, clientType, category, priority, attention]
  );

  res.json(rows);
});

conversationsRouter.get("/:id/contact", async (req: AuthRequest, res) => {
  const rows = await query(
    `SELECT ct.id, ct.name, ct.phone, ct.city, ct.inquiry_reason, ct.client_type, ct.category, ct.channel, ct.external_id
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.id = $1 AND c.workspace_id = $2
     LIMIT 1`,
    [req.params.id, req.user?.workspaceId]
  );

  res.json(rows[0] || null);
});

conversationsRouter.get("/:id/messages", async (req: AuthRequest, res) => {
  const rows = await query(
    `SELECT id, direction, body, author_user_id, external_message_id, attachment_url, attachment_type, attachment_name, created_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [req.params.id]
  );

  res.json(rows);
});

conversationsRouter.patch("/:id/status", async (req: AuthRequest, res) => {
  const { status } = req.body as { status: string };
  const cleanStatus = (status || "").trim().toLowerCase();
  if (!["open", "closed"].includes(cleanStatus)) {
    res.status(400).json({ error: "invalid_status" });
    return;
  }

  const rows = await query(
    `UPDATE conversations
     SET status = $1, updated_at = now()
     WHERE id = $2 AND workspace_id = $3
     RETURNING id, status, updated_at`,
    [cleanStatus, req.params.id, req.user?.workspaceId]
  );

  if (cleanStatus === "closed" && rows[0]) {
    await createSlaFollowUpTaskIfNeeded(req.user?.workspaceId || "", req.user?.id || "", req.params.id);
  }

  res.json(rows[0] || null);
});

conversationsRouter.patch("/:id/priority", async (req: AuthRequest, res) => {
  const { priority } = req.body as { priority: string };
  const cleanPriority = (priority || "").trim().toLowerCase();
  if (!["low", "normal", "high", "urgent"].includes(cleanPriority)) {
    res.status(400).json({ error: "invalid_priority" });
    return;
  }

  const rows = await query(
    `UPDATE conversations
     SET priority = $1, updated_at = now()
     WHERE id = $2 AND workspace_id = $3
     RETURNING id, priority, updated_at`,
    [cleanPriority, req.params.id, req.user?.workspaceId]
  );
  res.json(rows[0] || null);
});

conversationsRouter.patch("/:id/assign-manager", async (req: AuthRequest, res) => {
  const { managerId } = req.body as { managerId?: string | null };
  const managerValue = (managerId || "").trim();
  if (managerValue) {
    const managerExists = await query<{ id: string }>(
      `SELECT id
       FROM users
       WHERE id = $1
         AND workspace_id = $2
         AND role = 'manager'
         AND is_active = true
       LIMIT 1`,
      [managerValue, req.user?.workspaceId]
    );
    if (!managerExists[0]) {
      res.status(400).json({ error: "invalid_manager" });
      return;
    }
  }

  const rows = await query(
    `UPDATE conversations
     SET assigned_manager_id = NULLIF($1, '')::uuid, updated_at = now()
     WHERE id = $2 AND workspace_id = $3
     RETURNING id, assigned_manager_id, updated_at`,
    [managerValue, req.params.id, req.user?.workspaceId]
  );
  res.json(rows[0] || null);
});

conversationsRouter.post("/:id/tasks", async (req: AuthRequest, res) => {
  const { title, dueAt } = req.body as { title?: string; dueAt?: string | null };
  const cleanTitle = (title || "").trim();
  if (!cleanTitle) {
    res.status(400).json({ error: "task_title_required" });
    return;
  }

  const conversationRows = await query<{ id: string; workspace_id: string; deal_id: string | null }>(
    `SELECT c.id, c.workspace_id, d.id AS deal_id
     FROM conversations c
     LEFT JOIN deals d ON d.conversation_id = c.id
     WHERE c.id = $1 AND c.workspace_id = $2
     LIMIT 1`,
    [req.params.id, req.user?.workspaceId]
  );
  const conversation = conversationRows[0];
  if (!conversation) {
    res.status(404).json({ error: "conversation_not_found" });
    return;
  }

  const inserted = await query(
    `INSERT INTO tasks (workspace_id, conversation_id, deal_id, owner_user_id, title, due_at)
     VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::timestamp)
     RETURNING id, conversation_id, deal_id, owner_user_id, title, status, due_at, created_at`,
    [
      req.user?.workspaceId,
      req.params.id,
      conversation.deal_id,
      req.user?.id,
      cleanTitle,
      dueAt || ""
    ]
  );

  res.status(201).json(inserted[0]);
});

conversationsRouter.patch("/:id/tasks/sla-follow-up/done", async (req: AuthRequest, res) => {
  const rows = await query<{ id: string }>(
    `UPDATE tasks
     SET status = 'done', updated_at = now()
     WHERE id = (
       SELECT id
       FROM tasks
       WHERE workspace_id = $1
         AND conversation_id = $2
         AND status = 'open'
         AND title = 'SLA follow-up'
       ORDER BY created_at DESC
       LIMIT 1
     )
     RETURNING id`,
    [req.user?.workspaceId, req.params.id]
  );

  if (!rows[0]) {
    res.status(404).json({ error: "sla_follow_up_not_found" });
    return;
  }

  res.json({ ok: true, taskId: rows[0].id });
});

conversationsRouter.patch("/:id/sla-escalation/ack", async (req: AuthRequest, res) => {
  const rows = await query<{ id: string; first_response_due_at: string | null }>(
    `UPDATE conversations
     SET first_response_due_at = now() + interval '15 minutes',
         updated_at = now()
     WHERE id = $1
       AND workspace_id = $2
       AND status = 'open'
     RETURNING id, first_response_due_at`,
    [req.params.id, req.user?.workspaceId]
  );

  if (!rows[0]) {
    res.status(404).json({ error: "conversation_not_found_or_closed" });
    return;
  }

  await query(
    `INSERT INTO activities (workspace_id, user_id, conversation_id, action, metadata)
     VALUES ($1, $2, $3, 'sla_escalation_acknowledged', $4::jsonb)`,
    [
      req.user?.workspaceId,
      req.user?.id,
      req.params.id,
      JSON.stringify({ newDueAt: rows[0].first_response_due_at })
    ]
  );

  res.json({ ok: true, conversationId: rows[0].id, firstResponseDueAt: rows[0].first_response_due_at });
});

conversationsRouter.patch("/:id/sla-escalation/defer", async (req: AuthRequest, res) => {
  const rawMinutes = Number(req.body?.minutes || 30);
  const minutes = [15, 30, 60].includes(rawMinutes) ? rawMinutes : 30;

  const rows = await query<{ id: string; first_response_due_at: string | null }>(
    `UPDATE conversations
     SET first_response_due_at = now() + ($3::int * interval '1 minute'),
         updated_at = now()
     WHERE id = $1
       AND workspace_id = $2
       AND status = 'open'
     RETURNING id, first_response_due_at`,
    [req.params.id, req.user?.workspaceId, minutes]
  );

  if (!rows[0]) {
    res.status(404).json({ error: "conversation_not_found_or_closed" });
    return;
  }

  await query(
    `INSERT INTO activities (workspace_id, user_id, conversation_id, action, metadata)
     VALUES ($1, $2, $3, 'sla_escalation_deferred', $4::jsonb)`,
    [
      req.user?.workspaceId,
      req.user?.id,
      req.params.id,
      JSON.stringify({ minutes, newDueAt: rows[0].first_response_due_at })
    ]
  );

  res.json({
    ok: true,
    conversationId: rows[0].id,
    firstResponseDueAt: rows[0].first_response_due_at,
    deferredMinutes: minutes
  });
});

conversationsRouter.patch("/:id/contact", async (req: AuthRequest, res) => {
  const { name, phone, city, inquiryReason, clientType, category } = req.body as {
    name: string;
    phone: string;
    city: string;
    inquiryReason: string;
    clientType: string;
    category: string;
  };

  const rows = await query(
    `UPDATE contacts
     SET name = $1,
         phone = $2,
         city = NULLIF($3, ''),
         inquiry_reason = NULLIF($4, ''),
         client_type = NULLIF($5, ''),
         category = NULLIF($6, '')
     WHERE id = (
       SELECT contact_id FROM conversations
       WHERE id = $7 AND workspace_id = $8
     )
     RETURNING id, name, phone, city, inquiry_reason, client_type, category`,
    [name, phone, city, inquiryReason, clientType, category, req.params.id, req.user?.workspaceId]
  );

  res.json(rows[0] || null);
});

conversationsRouter.post("/:id/messages", upload.single("file"), async (req: AuthRequest, res) => {
  const body = typeof req.body?.body === "string" ? req.body.body : "";
  const file = req.file;
  const uploadMimeType = file ? resolveUploadMimeType(file) : "";
  const attachmentType = file ? resolveAttachmentType(uploadMimeType) : null;
  const attachmentUrl = file ? `/uploads/${file.filename}` : null;
  const attachmentName = file?.originalname || null;
  const storedBody =
    body.trim() ||
    (attachmentType === "audio" ? "[Голосовое сообщение]" : attachmentType ? "[Медиа]" : "");

  if (!storedBody.trim() && !file) {
    res.status(400).json({ error: "body_or_file_required" });
    return;
  }

  const workspaceId = req.user?.workspaceId || "";
  const whatsappTextMessageId = body.trim() && !file
    ? await sendWhatsAppMessageForConversation(req.params.id, workspaceId, body)
    : null;
  const whatsappFileMessageId =
    file && attachmentType
      ? await sendWhatsAppFileForConversation(req.params.id, workspaceId, path.join(uploadsDir, file.filename), file.originalname, body)
      : null;
  const telegramMessageId = body.trim() && !file
    ? await sendTelegramMessageForConversation(req.params.id, workspaceId, body)
    : null;
  const externalMessageId = whatsappFileMessageId || whatsappTextMessageId || telegramMessageId;
  const inserted = await query<{ id: string; created_at: string }>(
    `INSERT INTO messages (
      conversation_id, workspace_id, direction, body, author_user_id, external_message_id, attachment_url, attachment_type, attachment_name
    )
     VALUES ($1, $2, 'outgoing', $3, $4, $5, $6, $7, $8)
     RETURNING id, created_at`,
    [req.params.id, req.user?.workspaceId, storedBody, req.user?.id, externalMessageId, attachmentUrl, attachmentType, attachmentName]
  );

  await query(
    "UPDATE conversations SET updated_at = now(), first_response_due_at = NULL WHERE id = $1",
    [req.params.id]
  );
  await query(
    `INSERT INTO activities (workspace_id, user_id, conversation_id, action, metadata)
     VALUES ($1, $2, $3, 'message_sent', $4::jsonb)`,
    [
      req.user?.workspaceId,
      req.user?.id,
      req.params.id,
      JSON.stringify({
        bodyLength: body.length,
        hasAttachment: Boolean(file),
        attachmentType
      })
    ]
  );

  res.status(201).json(inserted[0]);
});

async function createSlaFollowUpTaskIfNeeded(
  workspaceId: string,
  ownerUserId: string,
  conversationId: string
): Promise<void> {
  if (!workspaceId || !ownerUserId || !conversationId) {
    return;
  }

  const [signal] = await query<{ is_overdue: boolean; deal_id: string | null }>(
    `SELECT (
        c.first_response_due_at IS NOT NULL
        AND c.first_response_due_at < now()
        AND EXISTS (
          SELECT 1
          FROM messages mi
          WHERE mi.conversation_id = c.id
            AND mi.direction = 'incoming'
            AND mi.created_at > COALESCE((
              SELECT MAX(mo.created_at)
              FROM messages mo
              WHERE mo.conversation_id = c.id
                AND mo.direction = 'outgoing'
            ), '1970-01-01'::timestamp)
        )
      ) AS is_overdue,
      d.id AS deal_id
     FROM conversations c
     LEFT JOIN deals d ON d.conversation_id = c.id
     WHERE c.workspace_id = $1 AND c.id = $2
     LIMIT 1`,
    [workspaceId, conversationId]
  );

  if (!signal?.is_overdue) {
    return;
  }

  const existing = await query<{ id: string }>(
    `SELECT id
     FROM tasks
     WHERE workspace_id = $1
       AND conversation_id = $2
       AND status = 'open'
       AND title = 'SLA follow-up'
     LIMIT 1`,
    [workspaceId, conversationId]
  );
  if (existing[0]) {
    return;
  }

  await query(
    `INSERT INTO tasks (workspace_id, conversation_id, deal_id, owner_user_id, title, due_at)
     VALUES ($1, $2, $3, $4, 'SLA follow-up', now() + interval '4 hours')`,
    [workspaceId, conversationId, signal.deal_id, ownerUserId]
  );
}
