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
  "video/quicktime"
]);

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
    cb(null, allowedMimeTypes.has(file.mimetype));
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
  const { q = "", managerId = "", stage = "", city = "", inquiryReason = "", clientType = "", category = "" } =
    req.query as Record<string, string>;
  const rows = await query(
    `SELECT c.id, c.contact_id, c.assigned_manager_id, c.channel, c.status, c.updated_at,
            ct.name AS contact_name, ct.phone, ct.city, ct.inquiry_reason, ct.client_type, ct.category,
            ct.channel AS contact_channel, ct.external_id AS contact_external_id,
            d.id AS deal_id, d.stage, d.amount,
            m.body AS last_message_body, m.direction AS last_message_direction, m.created_at AS last_message_at
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     LEFT JOIN deals d ON d.conversation_id = c.id
     LEFT JOIN LATERAL (
       SELECT body, direction, created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
     ) m ON true
     WHERE c.workspace_id = $1
       AND ($2 = '' OR LOWER(ct.name) LIKE LOWER('%' || $2 || '%') OR ct.phone LIKE '%' || $2 || '%')
       AND (NULLIF($3, '') IS NULL OR c.assigned_manager_id = NULLIF($3, '')::uuid)
       AND ($4 = '' OR d.stage = $4)
       AND ($5 = '' OR LOWER(COALESCE(ct.city, '')) = LOWER($5))
       AND ($6 = '' OR LOWER(COALESCE(ct.inquiry_reason, '')) = LOWER($6))
       AND ($7 = '' OR LOWER(COALESCE(ct.client_type, '')) = LOWER($7))
       AND ($8 = '' OR LOWER(COALESCE(ct.category, '')) = LOWER($8))
     ORDER BY c.updated_at DESC`,
    [req.user?.workspaceId, q, managerId, stage, city, inquiryReason, clientType, category]
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
  res.json(rows[0] || null);
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
  const attachmentType = file?.mimetype?.startsWith("video/") ? "video" : file?.mimetype?.startsWith("image/") ? "image" : null;
  const attachmentUrl = file ? `/uploads/${file.filename}` : null;
  const attachmentName = file?.originalname || null;

  if (!body.trim() && !file) {
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
    [req.params.id, req.user?.workspaceId, body, req.user?.id, externalMessageId, attachmentUrl, attachmentType, attachmentName]
  );

  await query("UPDATE conversations SET updated_at = now() WHERE id = $1", [req.params.id]);
  await query(
    `INSERT INTO activity_logs (workspace_id, user_id, conversation_id, action, metadata)
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
