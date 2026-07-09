import { Router } from "express";
import multer from "multer";
import { Server } from "socket.io";
import { resolveAutoAssignedManager } from "../../../auto-assignment";
import { query } from "../../../db";
import { getRealtimeServer } from "../../../realtime";
import { authMiddleware, type AuthRequest } from "../../auth";
import {
  mediaUpload,
  placeholderBodyForAttachment,
  resolveAttachmentType,
  resolveUploadMimeType
} from "../../media/upload";
import {
  createWebChatVisitorToken,
  createWebChatWidgetId,
  DEMO_LANDING_WIDGET_ID,
  disableWorkspaceWebChat,
  ensureDemoLandingWebChat,
  getPublicWebChatConfig,
  getWorkspaceWebChatSettings,
  saveWorkspaceWebChatSettings
} from "./credentials";

type PublicMessage = {
  id: string;
  direction: "incoming" | "outgoing";
  body: string;
  created_at: string;
  attachment_url?: string | null;
  attachment_type?: "image" | "video" | "audio" | "document" | null;
  attachment_name?: string | null;
};

type WebChatAttachment = {
  attachmentUrl?: string | null;
  attachmentType?: "image" | "video" | "audio" | "document" | null;
  attachmentName?: string | null;
};

function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || "https://light-crm-backend.onrender.com").replace(/\/+$/, "");
}

function widgetScriptUrl(): string {
  return `${publicBaseUrl()}/widget.js`;
}

function absoluteMediaUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `${publicBaseUrl()}${url.startsWith("/") ? url : `/${url}`}`;
}

function toPublicMessage(row: PublicMessage): PublicMessage {
  return {
    ...row,
    attachment_url: absoluteMediaUrl(row.attachment_url),
    attachment_type: row.attachment_type || null,
    attachment_name: row.attachment_name || null
  };
}

function sanitizeVisitorName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, 80);
}

async function findConversationByVisitor(
  workspaceId: string,
  visitorToken: string
): Promise<{ conversationId: string; contactId: string } | null> {
  const rows = await query<{ conversation_id: string; contact_id: string }>(
    `SELECT c.id AS conversation_id, ct.id AS contact_id
     FROM contacts ct
     JOIN conversations c ON c.contact_id = ct.id AND c.workspace_id = ct.workspace_id
     WHERE ct.workspace_id = $1
       AND ct.channel = 'web'
       AND ct.external_id = $2
     ORDER BY c.updated_at DESC
     LIMIT 1`,
    [workspaceId, visitorToken]
  );
  if (!rows[0]) {
    return null;
  }
  return {
    conversationId: rows[0].conversation_id,
    contactId: rows[0].contact_id
  };
}

async function ensureVisitorConversation(
  workspaceId: string,
  visitorToken: string,
  visitorName?: string
): Promise<{ conversationId: string; contactId: string; created: boolean }> {
  const existing = await findConversationByVisitor(workspaceId, visitorToken);
  if (existing) {
    if (visitorName) {
      await query(`UPDATE contacts SET name = $1 WHERE id = $2 AND name <> $1`, [
        visitorName,
        existing.contactId
      ]);
    }
    return { ...existing, created: false };
  }

  const managerId = await resolveAutoAssignedManager(workspaceId);
  const displayName = visitorName || `Посетитель сайта`;

  const contactId = (
    await query<{ id: string }>(
      `INSERT INTO contacts (workspace_id, name, phone, channel, external_id)
       VALUES ($1, $2, $3, 'web', $3)
       RETURNING id`,
      [workspaceId, displayName, visitorToken]
    )
  )[0].id;

  const conversationId = (
    await query<{ id: string }>(
      `INSERT INTO conversations (workspace_id, contact_id, assigned_manager_id, channel, priority, first_response_due_at)
       VALUES ($1, $2, $3, 'web', 'normal', now() + interval '15 minutes')
       RETURNING id`,
      [workspaceId, contactId, managerId ?? null]
    )
  )[0].id;

  return { conversationId, contactId, created: true };
}

async function listConversationMessages(conversationId: string): Promise<PublicMessage[]> {
  const rows = await query<PublicMessage>(
    `SELECT id, direction, body, created_at, attachment_url, attachment_type, attachment_name
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT 200`,
    [conversationId]
  );
  return rows.map(toPublicMessage);
}

export function createWebChatRouter(io: Server): Router {
  const router = Router();

  router.get("/status", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const settings = await getWorkspaceWebChatSettings(req.user.workspaceId);
    const connected = Boolean(settings?.enabled && settings.widgetId);
    const base = publicBaseUrl();
    const embedSnippet = settings?.widgetId
      ? `<script src="${widgetScriptUrl()}" data-widget-id="${settings.widgetId}" async></script>`
      : null;

    res.json({
      connected,
      enabled: Boolean(settings?.enabled),
      widgetId: settings?.widgetId || null,
      title: settings?.title || "Онлайн-чат",
      greeting: settings?.greeting || "Здравствуйте! Напишите нам — ответим в ближайшее время.",
      primaryColor: settings?.primaryColor || "#5b5ce9",
      connectedAt: settings?.connectedAt || null,
      publicBaseUrl: base,
      widgetScriptUrl: widgetScriptUrl(),
      embedSnippet
    });
  });

  router.post("/connect", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      const existing = await getWorkspaceWebChatSettings(req.user.workspaceId);
      const widgetId = existing?.widgetId || createWebChatWidgetId();
      const title =
        typeof req.body?.title === "string" && req.body.title.trim()
          ? req.body.title.trim()
          : existing?.title || "Онлайн-чат";
      const greeting =
        typeof req.body?.greeting === "string" && req.body.greeting.trim()
          ? req.body.greeting.trim()
          : existing?.greeting || "Здравствуйте! Напишите нам — ответим в ближайшее время.";
      const primaryColor =
        typeof req.body?.primaryColor === "string" && req.body.primaryColor.trim()
          ? req.body.primaryColor.trim()
          : existing?.primaryColor || "#5b5ce9";

      const settings = await saveWorkspaceWebChatSettings(req.user.workspaceId, {
        widgetId,
        enabled: true,
        title,
        greeting,
        primaryColor
      });

      const embedSnippet = `<script src="${widgetScriptUrl()}" data-widget-id="${settings.widgetId}" async></script>`;

      res.json({
        ok: true,
        connected: true,
        widgetId: settings.widgetId,
        title: settings.title,
        greeting: settings.greeting,
        primaryColor: settings.primaryColor,
        embedSnippet,
        widgetScriptUrl: widgetScriptUrl()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Web chat connect failed";
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/disconnect", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await disableWorkspaceWebChat(req.user.workspaceId);
    res.json({ ok: true, connected: false, enabled: false });
  });

  // Public widget endpoints
  router.get("/widget/:widgetId/config", async (req, res) => {
    const widgetId = String(req.params.widgetId || "");
    if (widgetId === DEMO_LANDING_WIDGET_ID) {
      try {
        await ensureDemoLandingWebChat();
      } catch (error) {
        console.error("Failed to ensure demo landing webchat:", error);
      }
    }
    const config = await getPublicWebChatConfig(widgetId);
    if (!config) {
      res.status(404).json({ error: "Widget not found or disabled" });
      return;
    }

    res.json({
      ok: true,
      widgetId: config.settings.widgetId,
      title: config.settings.title,
      greeting: config.settings.greeting,
      primaryColor: config.settings.primaryColor,
      socketPath: "/socket.io"
    });
  });

  router.post("/widget/:widgetId/session", async (req, res) => {
    const widgetId = String(req.params.widgetId || "");
    const config = await getPublicWebChatConfig(widgetId);
    if (!config) {
      res.status(404).json({ error: "Widget not found or disabled" });
      return;
    }

    const requestedToken =
      typeof req.body?.visitorToken === "string" ? req.body.visitorToken.trim() : "";
    const visitorName = sanitizeVisitorName(req.body?.visitorName);
    const visitorToken = requestedToken.startsWith("vis_")
      ? requestedToken
      : createWebChatVisitorToken();

    const session = await ensureVisitorConversation(
      config.workspaceId,
      visitorToken,
      visitorName || undefined
    );
    const messages = await listConversationMessages(session.conversationId);

    res.json({
      ok: true,
      visitorToken,
      conversationId: session.conversationId,
      messages
    });
  });

  router.get("/widget/:widgetId/session/:visitorToken/messages", async (req, res) => {
    const widgetId = String(req.params.widgetId || "");
    const visitorToken = String(req.params.visitorToken || "");
    const config = await getPublicWebChatConfig(widgetId);
    if (!config) {
      res.status(404).json({ error: "Widget not found or disabled" });
      return;
    }

    const session = await findConversationByVisitor(config.workspaceId, visitorToken);
    if (!session) {
      res.json({ ok: true, messages: [] as PublicMessage[] });
      return;
    }

    const messages = await listConversationMessages(session.conversationId);
    res.json({ ok: true, conversationId: session.conversationId, messages });
  });

  router.post(
    "/widget/:widgetId/session/:visitorToken/messages",
    (req, res, next) => {
      mediaUpload.single("file")(req, res, (error) => {
        if (error) {
          if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
            res.status(400).json({ error: "file_too_large" });
            return;
          }
          res.status(400).json({ error: "invalid_file" });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      const widgetId = String(req.params.widgetId || "");
      const visitorToken = String(req.params.visitorToken || "");
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      const visitorName = sanitizeVisitorName(req.body?.visitorName);
      const file = req.file;
      const uploadMimeType = file ? resolveUploadMimeType(file) : "";
      const attachmentType = file ? resolveAttachmentType(uploadMimeType) : null;
      const attachmentUrl = file ? `/uploads/${file.filename}` : null;
      const attachmentName = file?.originalname || null;
      const storedBody = body || (file ? placeholderBodyForAttachment(attachmentType) : "");

      if (!storedBody && !file) {
        res.status(400).json({ error: "body_or_file_required" });
        return;
      }
      if (body.length > 4000) {
        res.status(400).json({ error: "Message is too long" });
        return;
      }

      const config = await getPublicWebChatConfig(widgetId);
      if (!config) {
        res.status(404).json({ error: "Widget not found or disabled" });
        return;
      }

      try {
        const session = await ensureVisitorConversation(
          config.workspaceId,
          visitorToken,
          visitorName || undefined
        );

        const inserted = await query<{ id: string; created_at: string }>(
          `INSERT INTO messages (
            conversation_id, workspace_id, direction, body, attachment_url, attachment_type, attachment_name
          )
           VALUES ($1, $2, 'incoming', $3, $4, $5, $6)
           RETURNING id, created_at`,
          [
            session.conversationId,
            config.workspaceId,
            storedBody,
            attachmentUrl,
            attachmentType,
            attachmentName
          ]
        );

        await query(
          `UPDATE conversations
           SET updated_at = now(),
               status = 'open',
               first_response_due_at = now() + interval '15 minutes'
           WHERE id = $1`,
          [session.conversationId]
        );

        const publicMessage = toPublicMessage({
          id: inserted[0].id,
          direction: "incoming",
          body: storedBody,
          created_at: inserted[0].created_at,
          attachment_url: attachmentUrl,
          attachment_type: attachmentType,
          attachment_name: attachmentName
        });

        io.emit("message:new", {
          conversationId: session.conversationId,
          messageId: inserted[0].id,
          direction: "incoming",
          body: storedBody,
          createdAt: inserted[0].created_at,
          channel: "web",
          attachmentUrl: publicMessage.attachment_url,
          attachmentType: publicMessage.attachment_type,
          attachmentName: publicMessage.attachment_name
        });
        io.to(`webchat:${visitorToken}`).emit("webchat:message", publicMessage);

        res.status(201).json({
          ok: true,
          message: publicMessage
        });
      } catch (error) {
        console.error("Web chat inbound failed", error);
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  );

  return router;
}

export async function sendWebChatMessageForConversation(
  conversationId: string,
  workspaceId: string,
  body: string,
  messageId: string,
  createdAt: string,
  attachment?: WebChatAttachment
): Promise<string | null> {
  const rows = await query<{ channel: string; external_id: string | null }>(
    `SELECT c.channel, ct.external_id
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.id = $1 AND c.workspace_id = $2
     LIMIT 1`,
    [conversationId, workspaceId]
  );

  const conversation = rows[0];
  if (!conversation || conversation.channel !== "web" || !conversation.external_id) {
    return null;
  }

  const visitorToken = conversation.external_id;
  getRealtimeServer()?.to(`webchat:${visitorToken}`).emit("webchat:message", {
    id: messageId,
    direction: "outgoing",
    body,
    created_at: createdAt,
    attachment_url: absoluteMediaUrl(attachment?.attachmentUrl),
    attachment_type: attachment?.attachmentType || null,
    attachment_name: attachment?.attachmentName || null
  });

  return messageId;
}

export function attachWebChatSocketHandlers(io: Server): void {
  io.on("connection", (socket) => {
    socket.on("webchat:join", (payload: { visitorToken?: string; widgetId?: string }) => {
      const visitorToken =
        typeof payload?.visitorToken === "string" ? payload.visitorToken.trim() : "";
      if (!visitorToken.startsWith("vis_")) {
        return;
      }
      void socket.join(`webchat:${visitorToken}`);
    });
  });
}
