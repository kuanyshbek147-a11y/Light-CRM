import { Router } from "express";
import { Server } from "socket.io";
import { resolveAutoAssignedManager } from "../../../auto-assignment";
import { query } from "../../../db";
import { authMiddleware, type AuthRequest } from "../../auth";
import {
  clearWorkspaceInstagramCredentials,
  findWorkspaceIdByInstagramIgUserId,
  findWorkspaceIdByInstagramPageId,
  getEnvInstagramCredentials,
  getInstagramCredentialsForWorkspace,
  getWorkspaceInstagramCredentials,
  saveWorkspaceInstagramCredentials
} from "./credentials";
import {
  exchangeInstagramLoginCode,
  getInstagramAppId,
  getInstagramAppSecret,
  getInstagramLoginScopes,
  listInstagramPagesForUserToken,
  sendInstagramTextMessage,
  subscribeInstagramPageToApp,
  validateInstagramPageToken
} from "./graph";
import {
  isValidMetaWebhookSignature,
  verifyMetaWebhookChallenge
} from "../whatsapp/meta-cloud";

type JsonRecord = Record<string, unknown>;

type InstagramMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  };
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function createInstagramRouter(io: Server): Router {
  const router = Router();

  router.get("/webhook", (req, res) => {
    const challenge = verifyMetaWebhookChallenge(req.query as Record<string, unknown>);
    if (challenge) {
      res.status(200).send(challenge);
      return;
    }
    res.json({ ok: true, channel: "instagram" });
  });

  router.post("/webhook", async (req, res) => {
    const appSecret = getInstagramAppSecret();
    const rawBody = (req as { rawBody?: Buffer }).rawBody;
    const signatureHeader =
      typeof req.headers["x-hub-signature-256"] === "string" ? req.headers["x-hub-signature-256"] : undefined;

    if (!isValidMetaWebhookSignature(rawBody, signatureHeader, appSecret)) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }

    try {
      await processInstagramWebhook(req.body as JsonRecord, io);
      res.json({ ok: true });
    } catch (error) {
      console.error("Instagram webhook failed", error);
      res.status(500).json({ ok: false });
    }
  });

  router.get("/status", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const workspaceCreds = await getWorkspaceInstagramCredentials(req.user.workspaceId);
    const envCreds = getEnvInstagramCredentials();
    const credentials = workspaceCreds || envCreds;
    const missing: string[] = [];
    if (!credentials?.pageAccessToken) {
      missing.push("INSTAGRAM_ACCESS_TOKEN");
    }
    if (!credentials?.igUserId && !credentials?.pageId) {
      missing.push("INSTAGRAM_IG_USER_ID");
    }

    res.json({
      enabled: missing.length === 0,
      missing,
      connected: Boolean(workspaceCreds || envCreds),
      pageId: credentials?.pageId || null,
      igUserId: credentials?.igUserId || null,
      connectedAt: credentials?.connectedAt || null,
      source: workspaceCreds ? "workspace" : envCreds ? "env" : null,
      webhookPath: "/api/integrations/instagram/webhook",
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || process.env.INSTAGRAM_VERIFY_TOKEN || null,
      mode: "instagram_login",
      appId: getInstagramAppId() || null
    });
  });

  router.get("/connect/setup", (req, res) => {
    const appId = getInstagramAppId();
    const apiVersion = process.env.INSTAGRAM_API_VERSION || process.env.WHATSAPP_API_VERSION || "v21.0";
    const frontendOrigin =
      (typeof req.query.redirectOrigin === "string" && req.query.redirectOrigin.trim()) ||
      process.env.INSTAGRAM_OAUTH_REDIRECT_ORIGIN ||
      process.env.FRONTEND_PUBLIC_URL ||
      "https://light-crm-kz.netlify.app";
    const redirectUri =
      process.env.INSTAGRAM_OAUTH_REDIRECT_URI ||
      `${frontendOrigin.replace(/\/$/, "")}/`;

    res.json({
      mode: "instagram_login",
      appId,
      apiVersion,
      scopes: getInstagramLoginScopes(),
      redirectUri,
      webhookPath: "/api/integrations/instagram/webhook",
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || process.env.INSTAGRAM_VERIFY_TOKEN || null
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

    const pageId = typeof req.body?.pageId === "string" ? req.body.pageId.trim() : "";
    const pageAccessToken =
      typeof req.body?.pageAccessToken === "string" ? req.body.pageAccessToken.trim() : "";
    const igUserId = typeof req.body?.igUserId === "string" ? req.body.igUserId.trim() : "";

    if (!pageAccessToken || (!pageId && !igUserId)) {
      res.status(400).json({ error: "pageAccessToken and igUserId (or pageId) are required" });
      return;
    }

    try {
      const validated = await validateInstagramPageToken({
        pageId: pageId || igUserId,
        pageAccessToken,
        igUserId: igUserId || pageId
      });

      const resolvedIgUserId = validated.igUserId || igUserId || pageId;
      await saveWorkspaceInstagramCredentials(req.user.workspaceId, {
        pageId: pageId || resolvedIgUserId,
        pageAccessToken,
        igUserId: resolvedIgUserId
      });

      let pageSubscribed = false;
      if (pageId && pageId !== resolvedIgUserId) {
        try {
          pageSubscribed = await subscribeInstagramPageToApp(pageId, pageAccessToken);
        } catch (subscribeError) {
          console.error("Instagram page subscribe warning", subscribeError);
        }
      }

      res.json({
        ok: true,
        connected: true,
        pageId: pageId || resolvedIgUserId,
        pageName: validated.pageName,
        igUserId: resolvedIgUserId || null,
        igUsername: validated.igUsername,
        pageSubscribed
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Instagram connect failed";
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/connect/oauth", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const redirectUri =
      typeof req.body?.redirectUri === "string" ? req.body.redirectUri.trim() : "";
    const userAccessToken =
      typeof req.body?.userAccessToken === "string" ? req.body.userAccessToken.trim() : "";
    const preferredPageId = typeof req.body?.pageId === "string" ? req.body.pageId.trim() : "";

    // Preferred path: Instagram Login (app Light CRM-IG)
    if (code) {
      if (!redirectUri) {
        res.status(400).json({ ok: false, error: "redirectUri is required with code" });
        return;
      }
      try {
        const profile = await exchangeInstagramLoginCode({ code, redirectUri });
        await saveWorkspaceInstagramCredentials(req.user.workspaceId, {
          pageId: profile.igUserId,
          pageAccessToken: profile.accessToken,
          igUserId: profile.igUserId
        });
        res.json({
          ok: true,
          connected: true,
          mode: "instagram_login",
          pageId: profile.igUserId,
          pageName: profile.name || profile.username,
          igUserId: profile.igUserId,
          igUsername: profile.username,
          pageSubscribed: false
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Instagram Login failed";
        res.status(400).json({ ok: false, error: message });
      }
      return;
    }

    if (!userAccessToken) {
      res.status(400).json({ error: "code or userAccessToken is required" });
      return;
    }

    try {
      const pages = await listInstagramPagesForUserToken(userAccessToken);
      const pagesWithInstagram = pages.filter((page) => page.igUserId);
      const selected =
        pages.find((page) => preferredPageId && page.pageId === preferredPageId) ||
        pagesWithInstagram[0] ||
        pages[0];

      if (!selected) {
        res.status(400).json({
          ok: false,
          error:
            "Не найдено Facebook Page. Нужна страница, привязанная к Instagram Business/Creator."
        });
        return;
      }

      if (!selected.igUserId) {
        res.status(400).json({
          ok: false,
          error: `У страницы «${selected.pageName}» нет Instagram Business аккаунта.`,
          pages: pages.map((page) => ({
            pageId: page.pageId,
            pageName: page.pageName,
            igUsername: page.igUsername
          }))
        });
        return;
      }

      await saveWorkspaceInstagramCredentials(req.user.workspaceId, {
        pageId: selected.pageId,
        pageAccessToken: selected.pageAccessToken,
        igUserId: selected.igUserId
      });

      let pageSubscribed = false;
      try {
        pageSubscribed = await subscribeInstagramPageToApp(selected.pageId, selected.pageAccessToken);
      } catch (subscribeError) {
        console.error("Instagram page subscribe warning", subscribeError);
      }

      res.json({
        ok: true,
        connected: true,
        mode: "facebook_login",
        pageId: selected.pageId,
        pageName: selected.pageName,
        igUserId: selected.igUserId,
        igUsername: selected.igUsername,
        pageSubscribed,
        pages: pagesWithInstagram.map((page) => ({
          pageId: page.pageId,
          pageName: page.pageName,
          igUsername: page.igUsername
        }))
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Instagram OAuth connect failed";
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

    await clearWorkspaceInstagramCredentials(req.user.workspaceId);
    res.json({ ok: true, connected: false });
  });

  return router;
}

export async function sendInstagramMessageForConversation(
  conversationId: string,
  workspaceId: string,
  body: string
): Promise<string | null> {
  const rows = await query<{ channel: string; external_id: string | null }>(
    `SELECT c.channel, ct.external_id
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.id = $1 AND c.workspace_id = $2`,
    [conversationId, workspaceId]
  );

  const conversation = rows[0];
  if (!conversation || conversation.channel !== "instagram" || !conversation.external_id) {
    return null;
  }

  const credentials = await getInstagramCredentialsForWorkspace(workspaceId);
  if (!credentials) {
    return null;
  }

  return sendInstagramTextMessage(credentials, conversation.external_id, body);
}

async function processInstagramWebhook(payload: JsonRecord, io: Server): Promise<void> {
  const objectType = typeof payload.object === "string" ? payload.object : "";
  if (objectType !== "instagram" && objectType !== "page") {
    return;
  }

  for (const entryValue of asArray(payload.entry)) {
    const entry = asRecord(entryValue);
    if (!entry) {
      continue;
    }

    const entryId = typeof entry.id === "string" ? entry.id : "";
    const messagingEvents = [
      ...asArray(entry.messaging),
      ...asArray(entry.standby)
    ];

    for (const eventValue of messagingEvents) {
      const event = asRecord(eventValue) as InstagramMessagingEvent | null;
      if (!event) {
        continue;
      }
      await processInstagramMessagingEvent(event, entryId, io);
    }
  }
}

async function processInstagramMessagingEvent(
  event: InstagramMessagingEvent,
  entryId: string,
  io: Server
): Promise<void> {
  const message = event.message;
  if (!message || message.is_echo) {
    return;
  }

  const senderId = event.sender?.id;
  if (!senderId) {
    return;
  }

  const text = (message.text || "").trim();
  const attachmentHint = message.attachments?.[0]?.type
    ? `[${message.attachments[0].type}]`
    : "";
  const body = text || attachmentHint;
  if (!body) {
    return;
  }

  const recipientId = event.recipient?.id || entryId;
  let workspaceId =
    (await findWorkspaceIdByInstagramPageId(recipientId)) ||
    (await findWorkspaceIdByInstagramIgUserId(recipientId)) ||
    (await findWorkspaceIdByInstagramIgUserId(entryId)) ||
    (await findWorkspaceIdByInstagramPageId(entryId));

  if (!workspaceId) {
    const envCreds = getEnvInstagramCredentials();
    if (
      envCreds &&
      (envCreds.pageId === recipientId ||
        envCreds.pageId === entryId ||
        envCreds.igUserId === recipientId ||
        envCreds.igUserId === entryId)
    ) {
      const workspaceRows = await query<{ id: string }>("SELECT id FROM workspaces ORDER BY id ASC LIMIT 1");
      workspaceId = workspaceRows[0]?.id ?? null;
    }
  }

  if (!workspaceId) {
    const workspaceRows = await query<{ id: string }>("SELECT id FROM workspaces ORDER BY id ASC LIMIT 1");
    workspaceId = workspaceRows[0]?.id ?? null;
  }

  if (!workspaceId) {
    return;
  }

  const managerId = await resolveAutoAssignedManager(workspaceId);
  const contactName = `Instagram ${senderId.slice(-4)}`;

  const contactRows = await query<{ id: string }>(
    `SELECT id
     FROM contacts
     WHERE workspace_id = $1 AND channel = 'instagram' AND external_id = $2
     LIMIT 1`,
    [workspaceId, senderId]
  );

  const contactId =
    contactRows[0]?.id ??
    (
      await query<{ id: string }>(
        `INSERT INTO contacts (workspace_id, name, phone, channel, external_id)
         VALUES ($1, $2, $3, 'instagram', $3)
         RETURNING id`,
        [workspaceId, contactName, senderId]
      )
    )[0].id;

  const conversationRows = await query<{ id: string }>(
    `SELECT id
     FROM conversations
     WHERE workspace_id = $1 AND contact_id = $2
     LIMIT 1`,
    [workspaceId, contactId]
  );

  const conversationId =
    conversationRows[0]?.id ??
    (
      await query<{ id: string }>(
        `INSERT INTO conversations (workspace_id, contact_id, assigned_manager_id, channel, priority, first_response_due_at)
         VALUES ($1, $2, $3, 'instagram', 'normal', now() + interval '15 minutes')
         RETURNING id`,
        [workspaceId, contactId, managerId ?? null]
      )
    )[0].id;

  const externalMessageId = message.mid || null;
  if (externalMessageId) {
    const existing = await query<{ id: string }>(
      `SELECT id FROM messages WHERE conversation_id = $1 AND external_message_id = $2 LIMIT 1`,
      [conversationId, externalMessageId]
    );
    if (existing[0]) {
      return;
    }
  }

  const inserted = await query<{ id: string; created_at: string }>(
    `INSERT INTO messages (conversation_id, workspace_id, direction, body, external_message_id)
     VALUES ($1, $2, 'incoming', $3, $4)
     RETURNING id, created_at`,
    [conversationId, workspaceId, body, externalMessageId]
  );

  await query(
    `UPDATE conversations
     SET updated_at = now(),
         first_response_due_at = now() + interval '15 minutes'
     WHERE id = $1`,
    [conversationId]
  );

  io.emit("message:new", {
    conversationId,
    messageId: inserted[0].id,
    direction: "incoming",
    body,
    createdAt: inserted[0].created_at
  });
}
