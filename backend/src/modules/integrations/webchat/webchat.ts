import { Router } from "express";
import { Server } from "socket.io";
import { resolveAutoAssignedManager } from "../../../auto-assignment";
import { query } from "../../../db";
import { getRealtimeServer } from "../../../realtime";
import { authMiddleware, type AuthRequest } from "../../auth";
import {
  createWebChatVisitorToken,
  createWebChatWidgetId,
  disableWorkspaceWebChat,
  getPublicWebChatConfig,
  getWorkspaceWebChatSettings,
  saveWorkspaceWebChatSettings
} from "./credentials";

type PublicMessage = {
  id: string;
  direction: "incoming" | "outgoing";
  body: string;
  created_at: string;
};

function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || "https://light-crm-backend.onrender.com").replace(/\/+$/, "");
}

function widgetScriptUrl(): string {
  return `${publicBaseUrl()}/widget.js`;
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
  return query<PublicMessage>(
    `SELECT id, direction, body, created_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT 200`,
    [conversationId]
  );
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

  router.post("/widget/:widgetId/session/:visitorToken/messages", async (req, res) => {
    const widgetId = String(req.params.widgetId || "");
    const visitorToken = String(req.params.visitorToken || "");
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const visitorName = sanitizeVisitorName(req.body?.visitorName);

    if (!body) {
      res.status(400).json({ error: "body is required" });
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
        `INSERT INTO messages (conversation_id, workspace_id, direction, body)
         VALUES ($1, $2, 'incoming', $3)
         RETURNING id, created_at`,
        [session.conversationId, config.workspaceId, body]
      );

      await query(
        `UPDATE conversations
         SET updated_at = now(),
             status = 'open',
             first_response_due_at = now() + interval '15 minutes'
         WHERE id = $1`,
        [session.conversationId]
      );

      const payload = {
        conversationId: session.conversationId,
        messageId: inserted[0].id,
        direction: "incoming" as const,
        body,
        createdAt: inserted[0].created_at,
        channel: "web"
      };

      io.emit("message:new", payload);
      io.to(`webchat:${visitorToken}`).emit("webchat:message", {
        id: inserted[0].id,
        direction: "incoming",
        body,
        created_at: inserted[0].created_at
      });

      res.status(201).json({
        ok: true,
        message: {
          id: inserted[0].id,
          direction: "incoming",
          body,
          created_at: inserted[0].created_at
        }
      });
    } catch (error) {
      console.error("Web chat inbound failed", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  return router;
}

export async function sendWebChatMessageForConversation(
  conversationId: string,
  workspaceId: string,
  body: string,
  messageId: string,
  createdAt: string
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
    created_at: createdAt
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
