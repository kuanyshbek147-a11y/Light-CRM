import { Router } from "express";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { Server } from "socket.io";
import { resolveAutoAssignedManager } from "../../../auto-assignment";
import { query } from "../../../db";
import { authMiddleware, type AuthRequest } from "../../auth";
import { maybeAutoReply } from "../../auto-reply";
import { placeholderBodyForAttachment, uploadsDir } from "../../media/upload";
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
type AttachmentKind = "image" | "video" | "audio" | "document";

type InstagramAttachment = {
  type?: string;
  payload?: {
    url?: string;
    sticker_id?: number | string;
  };
};

type InstagramMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_unsupported?: boolean;
    attachments?: InstagramAttachment[];
  };
  reaction?: {
    mid?: string;
    action?: string;
    reaction?: string;
    emoji?: string;
  };
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapInstagramAttachmentType(type: string | undefined): AttachmentKind | null {
  const normalized = (type || "").toLowerCase();
  if (
    normalized === "image" ||
    normalized === "sticker" ||
    normalized === "story_mention" ||
    normalized === "share" ||
    normalized === "ig_post" ||
    normalized === "post" ||
    normalized === "template"
  ) {
    return "image";
  }
  if (normalized === "video" || normalized === "reel" || normalized === "ig_reel") {
    return "video";
  }
  if (normalized === "audio") {
    return "audio";
  }
  if (normalized === "file" || normalized === "fallback") {
    return "document";
  }
  return null;
}

function pickInstagramAttachment(
  attachments: InstagramAttachment[] | undefined
): { url: string; type: AttachmentKind; sourceType: string } | null {
  if (!attachments?.length) {
    return null;
  }

  const ranked = [...attachments].sort((a, b) => {
    const score = (item: InstagramAttachment): number => {
      const t = (item.type || "").toLowerCase();
      if (t === "sticker") return 3;
      if (t === "image") return 2;
      if (item.payload?.url) return 1;
      return 0;
    };
    return score(b) - score(a);
  });

  for (const item of ranked) {
    const url = item.payload?.url?.trim();
    if (!url) {
      continue;
    }
    const mapped = mapInstagramAttachmentType(item.type) || "image";
    return { url, type: mapped, sourceType: (item.type || "media").toLowerCase() };
  }
  return null;
}

async function downloadInstagramMediaToUploads(
  mediaUrl: string,
  sourceType: string,
  accessToken?: string
): Promise<{ url: string; attachmentType: AttachmentKind; fileName: string } | null> {
  try {
    const headers: Record<string, string> = {};
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    const response = await fetch(mediaUrl, { headers });
    if (!response.ok) {
      console.error(`Instagram media download failed: ${response.status}`);
      return null;
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    let attachmentType = mapInstagramAttachmentType(sourceType) || "image";
    if (contentType.startsWith("video/")) {
      attachmentType = "video";
    } else if (contentType.startsWith("audio/")) {
      attachmentType = "audio";
    } else if (contentType.startsWith("image/") || sourceType === "sticker") {
      attachmentType = "image";
    }

    let ext = "bin";
    if (contentType.includes("png") || sourceType === "sticker") {
      ext = contentType.includes("webp") ? "webp" : "png";
    } else if (contentType.includes("webp")) {
      ext = "webp";
    } else if (contentType.includes("gif")) {
      ext = "gif";
    } else if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      ext = "jpg";
    } else if (contentType.includes("mp4")) {
      ext = "mp4";
    } else if (contentType.includes("ogg")) {
      ext = "ogg";
    } else {
      try {
        const pathname = new URL(mediaUrl).pathname;
        const fromUrl = path.extname(pathname).replace(".", "").toLowerCase();
        if (fromUrl && fromUrl.length <= 5) {
          ext = fromUrl;
        }
      } catch {
        /* ignore */
      }
      if (ext === "bin" && attachmentType === "image") {
        ext = "jpg";
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      return null;
    }

    await mkdir(uploadsDir, { recursive: true });
    const fileName = `instagram-${randomUUID()}.${ext}`;
    await writeFile(path.join(uploadsDir, fileName), buffer);
    return {
      url: `/uploads/${fileName}`,
      attachmentType,
      fileName
    };
  } catch (error) {
    console.error("Instagram media download error", error);
    return null;
  }
}

function resolveInstagramWebhookSecrets(): string[] {
  const secrets = [
    getInstagramAppSecret(),
    process.env.WHATSAPP_APP_SECRET || "",
    process.env.META_APP_SECRET || ""
  ].filter(Boolean);
  return [...new Set(secrets)];
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
    const rawBody = (req as { rawBody?: Buffer }).rawBody;
    const signatureHeader =
      typeof req.headers["x-hub-signature-256"] === "string" ? req.headers["x-hub-signature-256"] : undefined;

    const secrets = resolveInstagramWebhookSecrets();
    const signatureOk =
      secrets.length === 0 ||
      secrets.some((secret) => isValidMetaWebhookSignature(rawBody, signatureHeader, secret));
    if (!signatureOk) {
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
  const reaction = event.reaction;

  // Heart / emoji reactions arrive without message.text
  if (!message && reaction) {
    const reactionBody =
      reaction.action === "unreact"
        ? "[Реакция снята]"
        : reaction.emoji || reaction.reaction || "❤️";
    await persistInstagramIncoming({
      event,
      entryId,
      io,
      body: reactionBody,
      externalMessageId: reaction.mid ? `reaction:${reaction.mid}:${reaction.action || "react"}` : null,
      attachmentUrl: null,
      attachmentType: null,
      attachmentName: null
    });
    return;
  }

  if (!message || message.is_echo) {
    return;
  }

  const text = (message.text || "").trim();
  const picked = pickInstagramAttachment(message.attachments);
  let attachmentUrl: string | null = null;
  let attachmentType: AttachmentKind | null = null;
  let attachmentName: string | null = null;

  if (picked) {
    const workspaceId = await resolveWorkspaceIdForInstagramEvent(event, entryId);
    const creds = workspaceId ? await getInstagramCredentialsForWorkspace(workspaceId) : null;
    const stored = await downloadInstagramMediaToUploads(
      picked.url,
      picked.sourceType,
      creds?.pageAccessToken
    );
    if (stored) {
      attachmentUrl = stored.url;
      attachmentType = stored.attachmentType;
      attachmentName =
        picked.sourceType === "sticker" ? "sticker" : stored.fileName;
    } else {
      // CDN URL may still open in the browser even if server-side download fails.
      attachmentUrl = picked.url;
      attachmentType = picked.type;
      attachmentName = picked.sourceType === "sticker" ? "sticker" : "instagram-media";
    }
  } else if (message.attachments?.some((item) => (item.type || "").toLowerCase() === "ephemeral")) {
    // View-once media — Meta never sends a URL.
    await persistInstagramIncoming({
      event,
      entryId,
      io,
      body: "[Одноразовое медиа Instagram]",
      externalMessageId: message.mid || null,
      attachmentUrl: null,
      attachmentType: null,
      attachmentName: null
    });
    return;
  }

  let body = text;
  if (!body && attachmentType) {
    body =
      picked?.sourceType === "sticker"
        ? "[Стикер]"
        : placeholderBodyForAttachment(attachmentType === "document" ? null : attachmentType);
  }
  if (!body && message.is_unsupported) {
    // Meta Instagram Messaging API: GIFs/stickers are not delivered (is_unsupported, no URL).
    // https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook/
    console.info("Instagram unsupported media", {
      mid: message.mid,
      attachmentTypes: (message.attachments || []).map((item) => item.type || null)
    });
    body = "🎨 Стикер / GIF (Meta не передаёт файл в API)";
  }
  if (!body && message.attachments?.length) {
    const types = message.attachments.map((item) => item.type || "media").join(",");
    body = `[${types}]`;
  }
  if (!body) {
    return;
  }

  await persistInstagramIncoming({
    event,
    entryId,
    io,
    body,
    externalMessageId: message.mid || null,
    attachmentUrl,
    attachmentType,
    attachmentName
  });
}

async function resolveWorkspaceIdForInstagramEvent(
  event: InstagramMessagingEvent,
  entryId: string
): Promise<string | null> {
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

  return workspaceId;
}

async function persistInstagramIncoming(params: {
  event: InstagramMessagingEvent;
  entryId: string;
  io: Server;
  body: string;
  externalMessageId: string | null;
  attachmentUrl: string | null;
  attachmentType: AttachmentKind | null;
  attachmentName: string | null;
}): Promise<void> {
  const senderId = params.event.sender?.id;
  if (!senderId) {
    return;
  }

  const workspaceId = await resolveWorkspaceIdForInstagramEvent(params.event, params.entryId);
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

  if (params.externalMessageId) {
    const existing = await query<{ id: string }>(
      `SELECT id FROM messages WHERE conversation_id = $1 AND external_message_id = $2 LIMIT 1`,
      [conversationId, params.externalMessageId]
    );
    if (existing[0]) {
      return;
    }
  }

  const inserted = await query<{ id: string; created_at: string }>(
    `INSERT INTO messages (
       conversation_id, workspace_id, direction, body, external_message_id,
       attachment_url, attachment_type, attachment_name
     )
     VALUES ($1, $2, 'incoming', $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [
      conversationId,
      workspaceId,
      params.body,
      params.externalMessageId,
      params.attachmentUrl,
      params.attachmentType,
      params.attachmentName
    ]
  );

  await query(
    `UPDATE conversations
     SET updated_at = now(),
         first_response_due_at = now() + interval '15 minutes'
     WHERE id = $1`,
    [conversationId]
  );

  params.io.emit("message:new", {
    conversationId,
    messageId: inserted[0].id,
    direction: "incoming",
    body: params.body,
    attachmentUrl: params.attachmentUrl,
    attachmentType: params.attachmentType,
    attachmentName: params.attachmentName,
    createdAt: inserted[0].created_at
  });

  void maybeAutoReply({
    workspaceId,
    conversationId,
    channel: "instagram",
    incomingBody: params.body,
    io: params.io
  });
}
