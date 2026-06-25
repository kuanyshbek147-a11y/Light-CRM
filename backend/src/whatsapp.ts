import { Router } from "express";
import { readFile } from "fs/promises";
import { Server } from "socket.io";
import { resolveAutoAssignedManager } from "./auto-assignment";
import { query } from "./db";
import { authMiddleware, type AuthRequest } from "./modules/auth";
import { finalizeEmbeddedSignupConnection, subscribeWabaToApp } from "./modules/integrations/whatsapp/embedded-signup";
import {
  ensureMetaPhoneRegistered,
  extractMetaContactNames,
  extractMetaMediaIds,
  extractWabaIdFromPayload,
  getMetaCloudConfig,
  getMetaCloudConfigForWorkspace,
  getMetaCloudMissing,
  getPlatformMetaSecrets,
  isMetaPhoneMessagingReady,
  isValidMetaWebhookSignature,
  resolveMetaMediaUrl,
  sendMetaFileMessage,
  sendMetaTextMessage,
  subscribeMetaAppWebhook,
  validateMetaPhoneNumber,
  verifyMetaWebhookChallenge
} from "./modules/integrations/whatsapp/meta-cloud";
import {
  clearWorkspaceMetaCredentials,
  findWorkspaceIdByWabaId,
  getWorkspaceMetaCredentials,
  saveWorkspaceMetaCredentials
} from "./modules/integrations/whatsapp/workspace-meta";

type JsonRecord = Record<string, unknown>;

type NormalizedIncomingMessage = {
  externalMessageId: string | null;
  externalContactId: string;
  body: string;
  contactName: string;
  attachmentUrl: string | null;
  attachmentType: "image" | "video" | null;
  attachmentName: string | null;
};

const CHATAPP_API_BASE_URL = (process.env.CHATAPP_API_BASE_URL || "https://api.chatapp.online").replace(/\/+$/, "");
const CHATAPP_API_TOKEN = process.env.CHATAPP_API_TOKEN || "";
const CHATAPP_SEND_MESSAGE_PATH = process.env.CHATAPP_SEND_MESSAGE_PATH || "/v1/messages";
const CHATAPP_WEBHOOK_SECRET = process.env.CHATAPP_WEBHOOK_SECRET || "";
const CHATAPP_WEBHOOK_SECRET_HEADER = (process.env.CHATAPP_WEBHOOK_SECRET_HEADER || "x-chatapp-secret").toLowerCase();
const CHATAPP_CHANNEL_ID = process.env.CHATAPP_CHANNEL_ID || "";
const CHATAPP_LICENSE_ID = process.env.CHATAPP_LICENSE_ID || "";
const WHATSAPP_PROVIDER = resolveWhatsAppProvider();

function resolveWhatsAppProvider(): "meta" | "chatapp" {
  const explicit = (process.env.WHATSAPP_PROVIDER || "meta").trim().toLowerCase();
  if (explicit === "chatapp") {
    return "chatapp";
  }
  return "meta";
}

export function createWhatsAppRouter(io: Server): Router {
  const router = Router();

  router.get("/webhook", (req, res) => {
    if (WHATSAPP_PROVIDER === "meta") {
      const challenge = verifyMetaWebhookChallenge(req.query as Record<string, unknown>);
      if (challenge) {
        res.status(200).send(challenge);
        return;
      }
      res.json({ ok: true, provider: "meta" });
      return;
    }

    res.json({ ok: true });
  });

  router.post("/webhook", async (req, res) => {
    if (WHATSAPP_PROVIDER === "meta") {
      const config = getMetaCloudConfig();
      const rawBody = (req as { rawBody?: Buffer }).rawBody;
      const signatureHeader =
        typeof req.headers["x-hub-signature-256"] === "string" ? req.headers["x-hub-signature-256"] : undefined;

      if (!isValidMetaWebhookSignature(rawBody, signatureHeader, config?.appSecret || "")) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
    } else if (!isValidWebhookSecret(req)) {
      res.status(403).json({ ok: false, error: "forbidden" });
      return;
    }

    try {
      await processWhatsAppWebhook(req.body as JsonRecord, io);
      res.json({ ok: true });
    } catch (error) {
      console.error(`${WHATSAPP_PROVIDER} WhatsApp webhook failed`, error);
      res.status(500).json({ ok: false });
    }
  });

  router.get("/status", async (req, res) => {
    if (WHATSAPP_PROVIDER === "meta") {
      const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : "";
      const config = workspaceId
        ? await getMetaCloudConfigForWorkspace(workspaceId)
        : getMetaCloudConfig();
      const missing = getMetaCloudMissing(config);
      const workspaceCreds = workspaceId ? await getWorkspaceMetaCredentials(workspaceId) : null;
      res.json({
        provider: "meta",
        enabled: missing.length === 0,
        missing,
        phoneNumberId: config?.phoneNumberId || null,
        appId: config?.appId || null,
        apiVersion: config?.apiVersion || "v21.0",
        webhookPath: "/api/integrations/whatsapp/webhook",
        workspaceConnected: Boolean(workspaceCreds),
        wabaId: workspaceCreds?.wabaId || null,
        connectedAt: workspaceCreds?.connectedAt || null
      });
      return;
    }

    const missing: string[] = [];
    if (!CHATAPP_API_TOKEN) {
      missing.push("CHATAPP_API_TOKEN");
    }
    if (!CHATAPP_SEND_MESSAGE_PATH) {
      missing.push("CHATAPP_SEND_MESSAGE_PATH");
    }
    res.json({
      provider: "chatapp",
      enabled: missing.length === 0,
      missing,
      apiBaseUrl: CHATAPP_API_BASE_URL,
      sendMessagePath: CHATAPP_SEND_MESSAGE_PATH,
      webhookPath: "/api/integrations/whatsapp/webhook"
    });
  });

  router.get("/connect/setup", (_req, res) => {
    const platform = getPlatformMetaSecrets();
    const appId = platform.appId || process.env.META_APP_ID || "2788233571542840";
    const configId = process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID || "859655197221237";
    const missing: string[] = [];
    if (!platform.appSecret) {
      missing.push("WHATSAPP_APP_SECRET");
    }
    res.json({
      provider: "meta",
      appId,
      configId,
      apiVersion: platform.apiVersion,
      flow: "cloud_api_migration",
      sessionInfoVersion: "3",
      ready: missing.length === 0,
      missing
    });
  });

  router.get("/connect/status", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const credentials = await getWorkspaceMetaCredentials(req.user.workspaceId);
    const config = await getMetaCloudConfigForWorkspace(req.user.workspaceId);
    let phone: Record<string, unknown> | null = null;
    let credentialsStale = false;
    if (config?.accessToken && config.phoneNumberId) {
      try {
        phone = (await validateMetaPhoneNumber(config)) as Record<string, unknown>;
      } catch (error) {
        phone = null;
        const message = error instanceof Error ? error.message : "";
        credentialsStale =
          message.includes("does not exist") ||
          message.includes("missing permissions") ||
          message.includes("GraphMethodException");
      }
    }

    const platformType = typeof phone?.platform_type === "string" ? phone.platform_type : null;
    const phoneStatus = typeof phone?.status === "string" ? phone.status : null;
    const messagingReady = isMetaPhoneMessagingReady(phone);

    res.json({
      connected: Boolean(credentials),
      wabaId: credentials?.wabaId || null,
      phoneNumberId: credentials?.phoneNumberId || null,
      connectedAt: credentials?.connectedAt || null,
      enabled: getMetaCloudMissing(config).length === 0,
      phone,
      messagingReady,
      needsRegistration: Boolean(credentials) && !messagingReady && !credentialsStale,
      needsReconnect: credentialsStale,
      needsCoexistence: false,
      platformType,
      phoneStatus
    });
  });

  router.post("/connect/complete", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const wabaId = typeof req.body?.wabaId === "string" ? req.body.wabaId.trim() : "";
    const phoneNumberId = typeof req.body?.phoneNumberId === "string" ? req.body.phoneNumberId.trim() : "";
    const webhookPublicBaseUrl =
      typeof req.body?.webhookPublicBaseUrl === "string" ? req.body.webhookPublicBaseUrl.trim() : "";
    const registrationPin = typeof req.body?.registrationPin === "string" ? req.body.registrationPin.trim() : "";

    if (!code) {
      res.status(400).json({ error: "code is required" });
      return;
    }

    try {
      const result = await finalizeEmbeddedSignupConnection({
        code,
        wabaId: wabaId || undefined,
        phoneNumberId: phoneNumberId || undefined,
        webhookPublicBaseUrl: webhookPublicBaseUrl || undefined,
        registrationPin: registrationPin || undefined
      });

      await saveWorkspaceMetaCredentials(req.user.workspaceId, {
        accessToken: result.accessToken,
        phoneNumberId: result.phoneNumberId,
        wabaId: result.wabaId
      });

      res.json({
        ok: true,
        connected: true,
        wabaId: result.wabaId,
        phoneNumberId: result.phoneNumberId,
        phone: result.phone,
        webhookSubscribed: result.webhookSubscribed,
        registered: result.registered
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "connect failed";
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/connect/register", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const registrationPin = typeof req.body?.registrationPin === "string" ? req.body.registrationPin.trim() : "";

    try {
      const config = await getMetaCloudConfigForWorkspace(req.user.workspaceId);
      if (!config?.accessToken || !config.phoneNumberId) {
        res.status(400).json({ ok: false, error: "WhatsApp не подключён. Сначала пройдите Embedded Signup." });
        return;
      }

      const { phone, registered } = await ensureMetaPhoneRegistered(config, registrationPin || undefined);
      res.json({
        ok: true,
        registered,
        phone,
        messagingReady: isMetaPhoneMessagingReady(phone)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "register failed";
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/connect/disconnect", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    await clearWorkspaceMetaCredentials(req.user.workspaceId);
    res.json({ ok: true, connected: false });
  });

  router.post("/connect/bootstrap", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const accessToken =
      (typeof req.body?.accessToken === "string" ? req.body.accessToken.trim() : "") ||
      process.env.WHATSAPP_ACCESS_TOKEN ||
      "";
    const phoneNumberId =
      (typeof req.body?.phoneNumberId === "string" ? req.body.phoneNumberId.trim() : "") ||
      process.env.WHATSAPP_PHONE_NUMBER_ID ||
      "";
    const wabaId =
      (typeof req.body?.wabaId === "string" ? req.body.wabaId.trim() : "") ||
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
      "";
    const publicBase = (
      typeof req.body?.webhookPublicBaseUrl === "string" ? req.body.webhookPublicBaseUrl.trim() : ""
    )
      .replace(/\/+$/, "") ||
      (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");

    if (!accessToken || !phoneNumberId || !wabaId) {
      res.status(400).json({
        ok: false,
        error: "accessToken, phoneNumberId and wabaId are required"
      });
      return;
    }

    try {
      await saveWorkspaceMetaCredentials(req.user.workspaceId, {
        accessToken,
        phoneNumberId,
        wabaId
      });
      await subscribeWabaToApp(wabaId, accessToken);

      let webhookSubscribed = false;
      if (publicBase) {
        await subscribeMetaAppWebhook(`${publicBase}/api/integrations/whatsapp/webhook`);
        webhookSubscribed = true;
      }

      const config = await getMetaCloudConfigForWorkspace(req.user.workspaceId);
      const { phone, registered } = config
        ? await ensureMetaPhoneRegistered(config)
        : { phone: null, registered: false };

      res.json({
        ok: true,
        connected: true,
        wabaId,
        phoneNumberId,
        phone,
        registered,
        webhookSubscribed,
        messagingReady: isMetaPhoneMessagingReady(phone as Record<string, unknown> | null)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "bootstrap failed";
      res.status(400).json({ ok: false, error: message });
    }
  });

  return router;
}

export async function sendWhatsAppMessageForConversation(
  conversationId: string,
  workspaceId: string,
  body: string
): Promise<string | null> {
  const rows = await query<{ channel: string; external_id: string | null; phone: string }>(
    `SELECT c.channel, ct.external_id, ct.phone
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.id = $1 AND c.workspace_id = $2`,
    [conversationId, workspaceId]
  );

  const conversation = rows[0];
  if (!conversation || conversation.channel !== "whatsapp") {
    return null;
  }

  const to = normalizeWhatsAppRecipient(conversation.external_id || conversation.phone);
  if (!to) {
    return null;
  }

  if (WHATSAPP_PROVIDER === "meta") {
    try {
      const metaConfig = await getMetaCloudConfigForWorkspace(workspaceId);
      return await sendMetaTextMessage(to, body, metaConfig);
    } catch (error) {
      console.error("Meta WhatsApp send failed with exception", error);
      return null;
    }
  }

  if (!CHATAPP_API_TOKEN || !CHATAPP_SEND_MESSAGE_PATH) {
    return null;
  }

  try {
    const licenseId = await resolveLicenseId();
    if (!licenseId) {
      console.error("ChatApp send skipped: licenseId not found");
      return null;
    }

    const url = resolveChatAppUrl(`/v1/licenses/${licenseId}/messengers/grWhatsApp/chats/${to}/messages/text`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: CHATAPP_API_TOKEN,
        Lang: "en"
      },
      body: JSON.stringify({
        text: body,
        sender: "employee"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ChatApp send failed: ${response.status} ${errorText}`);
      return null;
    }

    const payload = (await response.json()) as JsonRecord;
    return extractOutgoingExternalId(payload);
  } catch (error) {
    console.error("ChatApp send failed with exception", error);
    return null;
  }
}

export async function sendWhatsAppFileForConversation(
  conversationId: string,
  workspaceId: string,
  filePath: string,
  fileName: string,
  caption = ""
): Promise<string | null> {
  const rows = await query<{ channel: string; external_id: string | null; phone: string }>(
    `SELECT c.channel, ct.external_id, ct.phone
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.id = $1 AND c.workspace_id = $2`,
    [conversationId, workspaceId]
  );
  const conversation = rows[0];
  if (!conversation || conversation.channel !== "whatsapp") {
    return null;
  }
  const to = normalizeWhatsAppRecipient(conversation.external_id || conversation.phone);
  if (!to) {
    return null;
  }

  if (WHATSAPP_PROVIDER === "meta") {
    try {
      const metaConfig = await getMetaCloudConfigForWorkspace(workspaceId);
      return await sendMetaFileMessage(to, filePath, fileName, caption, metaConfig);
    } catch (error) {
      console.error("Meta WhatsApp file send failed with exception", error);
      return null;
    }
  }

  if (!CHATAPP_API_TOKEN) {
    return null;
  }

  try {
    const licenseId = await resolveLicenseId();
    if (!licenseId) {
      return null;
    }
    const fileBuffer = await readFile(filePath);
    const payload = new FormData();
    payload.append("file", new Blob([fileBuffer]), fileName);
    payload.append("fileName", fileName);
    payload.append("sender", "employee");
    if (caption.trim()) {
      payload.append("caption", caption.trim());
    }

    const url = resolveChatAppUrl(`/v1/licenses/${licenseId}/messengers/grWhatsApp/chats/${to}/messages/file`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: CHATAPP_API_TOKEN,
        Lang: "en"
      },
      body: payload
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ChatApp file send failed: ${response.status} ${errorText}`);
      return null;
    }
    const data = (await response.json()) as JsonRecord;
    return extractOutgoingExternalId(data);
  } catch (error) {
    console.error("ChatApp file send failed with exception", error);
    return null;
  }
}

async function processWhatsAppWebhook(payload: JsonRecord, io: Server): Promise<void> {
  const contactNames = WHATSAPP_PROVIDER === "meta" ? extractMetaContactNames(payload) : {};
  const mediaIdsByMessage = WHATSAPP_PROVIDER === "meta" ? extractMetaMediaIds(payload) : {};
  const messages = extractTextMessages(payload, contactNames);
  if (!messages.length) {
    return;
  }

  let workspaceId: string | null = null;
  if (WHATSAPP_PROVIDER === "meta") {
    const wabaId = extractWabaIdFromPayload(payload);
    if (wabaId) {
      workspaceId = await findWorkspaceIdByWabaId(wabaId);
    }
  }

  if (!workspaceId) {
    const workspaceRows = await query<{ id: string }>("SELECT id FROM workspaces ORDER BY id ASC LIMIT 1");
    workspaceId = workspaceRows[0]?.id ?? null;
  }
  if (!workspaceId) {
    return;
  }

  const metaConfig =
    WHATSAPP_PROVIDER === "meta" ? await getMetaCloudConfigForWorkspace(workspaceId) : null;
  const managerId = await resolveAutoAssignedManager(workspaceId);

  for (const message of messages) {
    if (!message.externalContactId) {
      continue;
    }

    if (!message.body && !message.attachmentUrl && message.externalMessageId) {
      const mediaId = mediaIdsByMessage[message.externalMessageId];
      if (mediaId) {
        const media = await resolveMetaMediaUrl(mediaId, metaConfig);
        if (media) {
          message.attachmentUrl = media.url;
          message.attachmentType = media.mimeType.startsWith("video/") ? "video" : "image";
          message.attachmentName = message.attachmentName || "whatsapp-media";
          if (!message.body) {
            message.body = message.attachmentType === "video" ? "[Видео]" : "[Изображение]";
          }
        }
      }
    }

    if (!message.body && !message.attachmentUrl) {
      continue;
    }

    const contactRows = await query<{ id: string }>(
      `SELECT id
       FROM contacts
       WHERE workspace_id = $1 AND channel = 'whatsapp' AND external_id = $2
       LIMIT 1`,
      [workspaceId, message.externalContactId]
    );

    const contactId =
      contactRows[0]?.id ??
      (
        await query<{ id: string }>(
          `INSERT INTO contacts (workspace_id, name, phone, channel, external_id)
           VALUES ($1, $2, $3, 'whatsapp', $4)
           RETURNING id`,
          [workspaceId, message.contactName, message.externalContactId, message.externalContactId]
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
           VALUES ($1, $2, $3, 'whatsapp', 'normal', now() + interval '15 minutes')
           RETURNING id`,
          [workspaceId, contactId, managerId ?? null]
        )
      )[0].id;

    if (message.externalMessageId) {
      const duplicate = await query<{ id: string }>(
        `SELECT id
         FROM messages
         WHERE workspace_id = $1 AND external_message_id = $2
         LIMIT 1`,
        [workspaceId, message.externalMessageId]
      );
      if (duplicate[0]) {
        continue;
      }
    }

    const inserted = await query<{ id: string; created_at: string }>(
      `INSERT INTO messages (
         conversation_id, workspace_id, direction, body, external_message_id, attachment_url, attachment_type, attachment_name
       )
       VALUES ($1, $2, 'incoming', $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [
        conversationId,
        workspaceId,
        message.body,
        message.externalMessageId,
        message.attachmentUrl,
        message.attachmentType,
        message.attachmentName
      ]
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
      body: message.body,
      createdAt: inserted[0].created_at
    });
  }
}

function extractTextMessages(payload: JsonRecord, contactNames: Record<string, string> = {}): NormalizedIncomingMessage[] {
  const candidates: unknown[] = [];
  const entry = asArray(payload.entry);
  for (const entryItem of entry) {
    const changes = asArray(getValue(entryItem, "changes"));
    for (const change of changes) {
      const value = asRecord(getValue(change, "value"));
      const messages = asArray(value?.messages);
      candidates.push(...messages);
    }
  }

  candidates.push(...asArray(payload.messages));
  candidates.push(...asArray(payload.data));
  candidates.push(...asArray(getValue(payload, "data.messages")));
  candidates.push(...asArray(getValue(payload, "result.messages")));

  const directMessage = asRecord(payload.message);
  if (directMessage) {
    candidates.push(directMessage);
  }

  const normalized = candidates
    .map((candidate) => normalizeIncomingMessage(candidate, payload, contactNames))
    .filter((item): item is NormalizedIncomingMessage => Boolean(item));

  if (!normalized.length) {
    const fallback = normalizeIncomingMessage(payload, payload, contactNames);
    if (fallback) {
      normalized.push(fallback);
    }
  }

  return normalized;
}

function normalizeWhatsAppRecipient(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeIncomingMessage(
  candidate: unknown,
  root: JsonRecord,
  contactNames: Record<string, string> = {}
): NormalizedIncomingMessage | null {
  const obj = asRecord(candidate);
  if (!obj) {
    return null;
  }

  const type = firstString([obj.type, getValue(obj, "message.type"), getValue(root, "meta.type")]) || "";
  const side = firstString([obj.side, getValue(obj, "meta.side")]) || "";
  const fromMe = getValue(obj, "fromMe") === true;
  if (fromMe || side === "out") {
    return null;
  }

  const fileLink = firstString([getValue(obj, "message.file.link"), getValue(obj, "file.link")]);
  const fileName = firstString([getValue(obj, "message.file.name"), getValue(obj, "file.name")]);
  const contentType = firstString([getValue(obj, "message.file.contentType"), getValue(obj, "file.contentType")]) || "";

  const metaImage = asRecord(obj.image);
  const metaVideo = asRecord(obj.video);
  const metaDocument = asRecord(obj.document);
  const metaSticker = asRecord(obj.sticker);
  const metaAudio = asRecord(obj.audio);
  const metaReaction = asRecord(obj.reaction);
  const textRecord = asRecord(obj.text);
  const textBody = typeof textRecord?.body === "string" ? textRecord.body : "";
  const reactionEmoji =
    typeof metaReaction?.emoji === "string" && metaReaction.emoji.trim() ? metaReaction.emoji.trim() : "";
  if (type === "reaction" && !reactionEmoji) {
    return null;
  }
  const metaCaption = firstString([metaImage?.caption, metaVideo?.caption, metaDocument?.caption]);

  const attachmentType: "image" | "video" | null =
    type === "image" || type === "sticker" || contentType.startsWith("image/") || Boolean(metaSticker?.id)
      ? "image"
      : type === "video" || contentType.startsWith("video/")
        ? "video"
        : null;

  let body =
    firstString([
      getValue(obj, "text.body"),
      textBody,
      reactionEmoji,
      metaCaption,
      getValue(obj, "message.caption"),
      getValue(obj, "message.text"),
      obj.message,
      obj.body,
      getValue(root, "text"),
      getValue(root, "message.text")
    ]) || "";
  body = body.trim();

  const hasMetaMedia = Boolean(
    metaImage?.id || metaVideo?.id || metaDocument?.id || metaSticker?.id || metaAudio?.id
  );

  if (!body && !fileLink && !hasMetaMedia) {
    if (type === "location") {
      body = "[Локация]";
    } else if (type === "contacts") {
      body = "[Контакт]";
    } else if (type === "interactive") {
      body = "[Интерактивное сообщение]";
    } else if (type === "button" || type === "request_welcome") {
      body = "[Системное сообщение]";
    } else {
      return null;
    }
  }

  if (!body && (fileLink || hasMetaMedia)) {
    if (type === "sticker" || metaSticker?.id) {
      body = "[Стикер]";
    } else if (type === "audio" || metaAudio?.id) {
      body = "[Голосовое сообщение]";
    } else if (type === "document" || metaDocument?.id) {
      body =
        typeof metaDocument?.filename === "string" && metaDocument.filename.trim()
          ? metaDocument.filename.trim()
          : "[Документ]";
    } else if (type === "video" || metaVideo?.id) {
      body = "[Видео]";
    } else if (type === "image" || metaImage?.id) {
      body = "[Изображение]";
    }
  }

  if (!body && !fileLink && !hasMetaMedia) {
    return null;
  }

  const externalContactId = normalizeWhatsAppRecipient(
    firstString([
      obj.from,
      getValue(obj, "chat.id"),
      getValue(obj, "chat.phone"),
      getValue(obj, "sender.phone"),
      getValue(obj, "sender.id"),
      getValue(obj, "customer.phone"),
      getValue(obj, "contact.phone"),
      root.from,
      getValue(root, "customer.phone")
    ]) || ""
  );
  if (!externalContactId) {
    return null;
  }

  const externalMessageId =
    firstString([
      obj.id,
      obj.messageId,
      getValue(obj, "message.id"),
      getValue(obj, "data.id"),
      root.id
    ]) || null;
  const contactName =
    contactNames[externalContactId] ||
    firstString([
      getValue(obj, "sender.name"),
      getValue(obj, "chat.name"),
      getValue(obj, "customer.name"),
      getValue(obj, "contact.name"),
      root.name
    ]) ||
    `WhatsApp ${externalContactId}`;

  return {
    externalMessageId,
    externalContactId,
    body,
    contactName,
    attachmentUrl: fileLink || null,
    attachmentType,
    attachmentName: fileName || null
  };
}

function resolveChatAppUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${CHATAPP_API_BASE_URL}${normalizedPath}`;
}

function extractOutgoingExternalId(payload: JsonRecord): string | null {
  return (
    firstString([
      payload.id,
      payload.messageId,
      getValue(payload, "data.id"),
      getValue(payload, "data.messageId"),
      getValue(payload, "result.id"),
      getValue(payload, "result.messageId"),
      getValue(payload, "data.0.id"),
      getValue(payload, "result.data.id")
    ]) || null
  );
}

async function resolveLicenseId(): Promise<string | null> {
  if (CHATAPP_LICENSE_ID) {
    return CHATAPP_LICENSE_ID;
  }

  const response = await fetch(resolveChatAppUrl("/v1/licenses"), {
    headers: {
      Authorization: CHATAPP_API_TOKEN,
      Lang: "en"
    }
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as JsonRecord;
  const licenses = asArray(payload.data);
  for (const item of licenses) {
    const licenseId = firstString([getValue(item, "licenseId")]);
    const messengers = asArray(getValue(item, "messenger"));
    const hasWhatsApp = messengers.some((messenger) => firstString([getValue(messenger, "type")]) === "grWhatsApp");
    if (licenseId && hasWhatsApp) {
      return licenseId;
    }
  }
  return null;
}

function isValidWebhookSecret(req: { headers: Record<string, unknown> }): boolean {
  if (!CHATAPP_WEBHOOK_SECRET) {
    return true;
  }
  const value = req.headers[CHATAPP_WEBHOOK_SECRET_HEADER];
  return typeof value === "string" && value === CHATAPP_WEBHOOK_SECRET;
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getValue(source: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = source;
  for (const part of parts) {
    const obj = asRecord(current);
    if (!obj) {
      return undefined;
    }
    current = obj[part];
  }
  return current;
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return null;
}
