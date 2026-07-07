import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getWorkspaceMetaCredentials } from "./workspace-meta";

type JsonRecord = Record<string, unknown>;

export type AttachmentKind = "image" | "video" | "audio" | "document";

export type MetaCloudConfig = {
  accessToken: string;
  phoneNumberId: string;
  appId: string;
  verifyToken: string;
  appSecret: string;
  apiVersion: string;
};

export function getMetaCloudConfig(): MetaCloudConfig | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const appId = process.env.WHATSAPP_APP_ID || process.env.META_APP_ID || "";
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "";
  const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || "";
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";

  if (!accessToken || !phoneNumberId) {
    return null;
  }

  return {
    accessToken,
    phoneNumberId,
    appId,
    verifyToken,
    appSecret,
    apiVersion
  };
}

export function getPlatformMetaSecrets(): Pick<MetaCloudConfig, "appId" | "verifyToken" | "appSecret" | "apiVersion"> {
  return {
    appId: process.env.WHATSAPP_APP_ID || process.env.META_APP_ID || "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    appSecret: process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || "",
    apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0"
  };
}

export async function getMetaCloudConfigForWorkspace(workspaceId: string): Promise<MetaCloudConfig | null> {
  const workspace = await getWorkspaceMetaCredentials(workspaceId);
  const platform = getPlatformMetaSecrets();

  if (workspace?.accessToken && workspace.phoneNumberId) {
    return {
      accessToken: workspace.accessToken,
      phoneNumberId: workspace.phoneNumberId,
      ...platform
    };
  }

  return getMetaCloudConfig();
}

export function getMetaCloudMissing(config: MetaCloudConfig | null): string[] {
  if (!config) {
    return ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"];
  }

  const missing: string[] = [];
  if (!config.accessToken) {
    missing.push("WHATSAPP_ACCESS_TOKEN");
  }
  if (!config.phoneNumberId) {
    missing.push("WHATSAPP_PHONE_NUMBER_ID");
  }
  if (!config.verifyToken) {
    missing.push("WHATSAPP_VERIFY_TOKEN");
  }
  if (!config.appSecret) {
    missing.push("WHATSAPP_APP_SECRET");
  }
  if (!config.appId) {
    missing.push("WHATSAPP_APP_ID");
  }
  return missing;
}

function appAccessToken(config: MetaCloudConfig): string {
  if (!config.appId || !config.appSecret) {
    throw new Error("WHATSAPP_APP_ID and WHATSAPP_APP_SECRET are required");
  }
  return `${config.appId}|${config.appSecret}`;
}

export async function subscribeMetaAppWebhook(callbackUrl: string): Promise<JsonRecord> {
  const config = getMetaCloudConfig();
  const platform = getPlatformMetaSecrets();
  const merged: MetaCloudConfig = {
    accessToken: config?.accessToken || "",
    phoneNumberId: config?.phoneNumberId || "",
    ...platform
  };

  if (!merged.appId) {
    throw new Error("WHATSAPP_APP_ID is required to subscribe webhook");
  }
  if (!merged.verifyToken) {
    throw new Error("WHATSAPP_VERIFY_TOKEN is required to subscribe webhook");
  }

  const params = new URLSearchParams({
    access_token: appAccessToken(merged),
    object: "whatsapp_business_account",
    callback_url: callbackUrl,
    verify_token: merged.verifyToken,
    fields: "messages,smb_message_echoes,history,smb_app_state_sync"
  });

  const response = await fetch(`${metaGraphBase(merged)}/${merged.appId}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    throw new Error(`Meta webhook subscribe failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

export async function subscribeMetaWebhook(callbackUrl: string): Promise<JsonRecord> {
  return subscribeMetaAppWebhook(callbackUrl);
}

export async function validateMetaPhoneNumber(config: MetaCloudConfig): Promise<JsonRecord> {
  const response = await fetch(
    `${metaGraphBase(config)}/${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,status,platform_type,is_on_biz_app`,
    { headers: { Authorization: `Bearer ${config.accessToken}` } }
  );
  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    throw new Error(`Meta connection check failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

export function isMetaPhoneMessagingReady(phone: JsonRecord | null | undefined): boolean {
  const platformType = typeof phone?.platform_type === "string" ? phone.platform_type : null;
  const phoneStatus = typeof phone?.status === "string" ? phone.status : null;
  return platformType === "CLOUD_API" && phoneStatus === "CONNECTED";
}

export async function registerMetaPhoneNumber(
  config: MetaCloudConfig,
  pin?: string
): Promise<JsonRecord> {
  const body: JsonRecord = { messaging_product: "whatsapp" };
  const resolvedPin = pin?.trim() || process.env.WHATSAPP_REGISTRATION_PIN?.trim() || "";
  if (resolvedPin) {
    body.pin = resolvedPin;
  }

  const response = await fetch(`${metaGraphBase(config)}/${config.phoneNumberId}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.accessToken}`
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    throw new Error(`Meta phone register failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

export async function ensureMetaPhoneRegistered(
  config: MetaCloudConfig,
  pin?: string
): Promise<{ phone: JsonRecord; registered: boolean }> {
  let phone = await validateMetaPhoneNumber(config);
  if (isMetaPhoneMessagingReady(phone)) {
    return { phone, registered: false };
  }

  await registerMetaPhoneNumber(config, pin);
  phone = await validateMetaPhoneNumber(config);
  return { phone, registered: true };
}

export async function validateMetaCloudConnection(): Promise<JsonRecord> {
  const config = getMetaCloudConfig();
  if (!config) {
    throw new Error("Meta WhatsApp config is incomplete");
  }
  return validateMetaPhoneNumber(config);
}

export async function getMetaWebhookSubscriptions(): Promise<JsonRecord> {
  const config = getMetaCloudConfig();
  if (!config?.appId) {
    throw new Error("WHATSAPP_APP_ID is required");
  }

  const response = await fetch(
    `${metaGraphBase(config)}/${config.appId}/subscriptions?access_token=${encodeURIComponent(config.accessToken)}`
  );
  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    throw new Error(`Meta webhook list failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

export function verifyMetaWebhookChallenge(query: Record<string, unknown>): string | null {
  const mode = typeof query["hub.mode"] === "string" ? query["hub.mode"] : "";
  const token = typeof query["hub.verify_token"] === "string" ? query["hub.verify_token"] : "";
  const challenge = typeof query["hub.challenge"] === "string" ? query["hub.challenge"] : "";
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "";

  if (mode === "subscribe" && token && verifyToken && token === verifyToken && challenge) {
    return challenge;
  }

  return null;
}

export function isValidMetaWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!appSecret) {
    return true;
  }
  if (!rawBody || !signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

export async function sendMetaTextMessage(
  to: string,
  body: string,
  configOverride?: MetaCloudConfig | null
): Promise<string | null> {
  const config = configOverride ?? getMetaCloudConfig();
  if (!config) {
    return null;
  }

  const response = await fetch(metaMessagesUrl(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.accessToken}`
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizeWhatsAppRecipient(to),
      type: "text",
      text: { preview_url: false, body }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Meta WhatsApp send failed: ${response.status} ${errorText}`);
    return null;
  }

  const payload = (await response.json()) as JsonRecord;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const first = messages[0] as JsonRecord | undefined;
  return typeof first?.id === "string" ? first.id : null;
}

export async function sendMetaFileMessage(
  to: string,
  filePath: string,
  fileName: string,
  caption = "",
  configOverride?: MetaCloudConfig | null
): Promise<string | null> {
  const config = configOverride ?? getMetaCloudConfig();
  if (!config) {
    return null;
  }

  const fileBuffer = await readFile(filePath);
  const mimeType = guessMimeType(fileName);
  const mediaType = mimeType.startsWith("video/") ? "video" : "image";
  const uploadForm = new FormData();
  uploadForm.append("messaging_product", "whatsapp");
  uploadForm.append("type", mimeType);
  uploadForm.append("file", new Blob([fileBuffer], { type: mimeType }), fileName);

  const uploadResponse = await fetch(metaMediaUrl(config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`
    },
    body: uploadForm
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error(`Meta WhatsApp media upload failed: ${uploadResponse.status} ${errorText}`);
    return null;
  }

  const uploadPayload = (await uploadResponse.json()) as JsonRecord;
  const mediaId = typeof uploadPayload.id === "string" ? uploadPayload.id : null;
  if (!mediaId) {
    return null;
  }

  const messageBody: JsonRecord = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeWhatsAppRecipient(to),
    type: mediaType,
    [mediaType]: {
      id: mediaId,
      ...(caption.trim() ? { caption: caption.trim() } : {})
    }
  };

  const response = await fetch(metaMessagesUrl(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.accessToken}`
    },
    body: JSON.stringify(messageBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Meta WhatsApp file send failed: ${response.status} ${errorText}`);
    return null;
  }

  const payload = (await response.json()) as JsonRecord;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const first = messages[0] as JsonRecord | undefined;
  return typeof first?.id === "string" ? first.id : null;
}

export async function resolveMetaMediaUrl(
  mediaId: string,
  configOverride?: MetaCloudConfig | null
): Promise<{ url: string; mimeType: string } | null> {
  const config = configOverride ?? getMetaCloudConfig();
  if (!config || !mediaId) {
    return null;
  }

  const response = await fetch(`${metaGraphBase(config)}/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`
    }
  });

  if (!response.ok) {
    console.error(`Meta WhatsApp media lookup failed: ${response.status}`);
    return null;
  }

  const payload = (await response.json()) as JsonRecord;
  const url = typeof payload.url === "string" ? payload.url : "";
  const mimeType = typeof payload.mime_type === "string" ? payload.mime_type : "application/octet-stream";
  if (!url) {
    return null;
  }

  return { url, mimeType };
}

export function mapMimeToAttachmentType(mimeType: string, messageType = ""): AttachmentKind {
  const mime = mimeType.toLowerCase();
  const type = messageType.toLowerCase();
  if (type === "audio" || mime.startsWith("audio/")) {
    return "audio";
  }
  if (type === "video" || mime.startsWith("video/")) {
    return "video";
  }
  if (type === "document" || (mime.startsWith("application/") && !mime.includes("image"))) {
    return "document";
  }
  if (mime.startsWith("image/")) {
    return "image";
  }
  return "document";
}

function extensionForMime(mimeType: string, messageType = ""): string {
  const mime = mimeType.toLowerCase();
  const type = messageType.toLowerCase();
  if (mime.includes("ogg")) {
    return "ogg";
  }
  if (mime.includes("mpeg") || mime.includes("mp3")) {
    return "mp3";
  }
  if (mime.includes("mp4")) {
    return type === "audio" ? "m4a" : "mp4";
  }
  if (mime.includes("pdf")) {
    return "pdf";
  }
  if (mime.includes("webp")) {
    return "webp";
  }
  if (mime.includes("png")) {
    return "png";
  }
  if (mime.includes("jpeg") || mime.includes("jpg")) {
    return "jpg";
  }
  return "bin";
}

export async function downloadMetaMediaToUploads(
  mediaId: string,
  configOverride?: MetaCloudConfig | null,
  messageType = ""
): Promise<{ url: string; mimeType: string; attachmentType: AttachmentKind; fileName: string } | null> {
  const media = await resolveMetaMediaUrl(mediaId, configOverride);
  if (!media) {
    return null;
  }

  const config = configOverride ?? getMetaCloudConfig();
  if (!config) {
    return null;
  }

  const downloadResponse = await fetch(media.url, {
    headers: { Authorization: `Bearer ${config.accessToken}` }
  });
  if (!downloadResponse.ok) {
    console.error(`Meta WhatsApp media download failed: ${downloadResponse.status}`);
    return null;
  }

  const buffer = Buffer.from(await downloadResponse.arrayBuffer());
  const attachmentType = mapMimeToAttachmentType(media.mimeType, messageType);
  const ext = extensionForMime(media.mimeType, messageType);
  const fileName = `whatsapp-${randomUUID()}.${ext}`;
  const uploadsDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, fileName), buffer);

  return {
    url: `/uploads/${fileName}`,
    mimeType: media.mimeType,
    attachmentType,
    fileName
  };
}

export async function fetchMetaGroupSubject(
  groupId: string,
  configOverride?: MetaCloudConfig | null
): Promise<string | null> {
  const config = configOverride ?? getMetaCloudConfig();
  if (!config || !groupId) {
    return null;
  }

  const response = await fetch(`${metaGraphBase(config)}/${groupId}?fields=subject`, {
    headers: { Authorization: `Bearer ${config.accessToken}` }
  });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as JsonRecord;
  return typeof payload.subject === "string" && payload.subject.trim() ? payload.subject.trim() : null;
}

export type MetaGroupSummary = {
  id: string;
  subject: string;
  createdAt: string | null;
};

export async function listMetaActiveGroups(
  configOverride?: MetaCloudConfig | null
): Promise<MetaGroupSummary[]> {
  const config = configOverride ?? getMetaCloudConfig();
  if (!config?.phoneNumberId) {
    return [];
  }

  const response = await fetch(`${metaGraphBase(config)}/${config.phoneNumberId}/groups?limit=50`, {
    headers: { Authorization: `Bearer ${config.accessToken}` }
  });
  if (!response.ok) {
    console.error(`Meta WhatsApp groups list failed: ${response.status}`);
    return [];
  }

  const payload = (await response.json()) as JsonRecord;
  const data = asRecord(payload.data);
  const groups = Array.isArray(data?.groups) ? data.groups : [];
  return groups
    .map((item) => {
      const record = asRecord(item);
      const id = typeof record?.id === "string" ? record.id : "";
      const subject = typeof record?.subject === "string" ? record.subject.trim() : "";
      const createdAt = typeof record?.created_at === "string" ? record.created_at : null;
      if (!id) {
        return null;
      }
      return { id, subject: subject || "Группа WhatsApp", createdAt };
    })
    .filter((item): item is MetaGroupSummary => Boolean(item));
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

export function extractMetaContactNames(payload: JsonRecord): Record<string, string> {
  const names: Record<string, string> = {};
  const entry = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entryItem of entry) {
    const entryRecord = entryItem as JsonRecord;
    const changes = Array.isArray(entryRecord.changes) ? entryRecord.changes : [];
    for (const change of changes) {
      const value = (change as JsonRecord).value as JsonRecord | undefined;
      const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
      for (const contact of contacts) {
        const record = contact as JsonRecord;
        const waId = typeof record.wa_id === "string" ? normalizeWhatsAppRecipient(record.wa_id) : "";
        const profile = record.profile as JsonRecord | undefined;
        const name = typeof profile?.name === "string" ? profile.name.trim() : "";
        if (waId && name) {
          names[waId] = name;
        }
      }
    }
  }

  return names;
}

export function extractMetaMediaIds(payload: JsonRecord): Record<string, string> {
  return Object.fromEntries(
    Object.entries(extractMetaMediaMeta(payload)).map(([messageId, meta]) => [messageId, meta.mediaId])
  );
}

export function extractMetaMediaMeta(
  payload: JsonRecord
): Record<string, { mediaId: string; messageType: string }> {
  const mediaMeta: Record<string, { mediaId: string; messageType: string }> = {};
  const entry = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entryItem of entry) {
    const entryRecord = entryItem as JsonRecord;
    const changes = Array.isArray(entryRecord.changes) ? entryRecord.changes : [];
    for (const change of changes) {
      const value = (change as JsonRecord).value as JsonRecord | undefined;
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      for (const message of messages) {
        const record = message as JsonRecord;
        const messageId = typeof record.id === "string" ? record.id : "";
        const type = typeof record.type === "string" ? record.type : "";
        const media = record[type] as JsonRecord | undefined;
        const mediaId = typeof media?.id === "string" ? media.id : "";
        if (messageId && mediaId) {
          mediaMeta[messageId] = { mediaId, messageType: type };
        }
      }
    }
  }

  return mediaMeta;
}

export function extractWabaIdFromPayload(payload: JsonRecord): string | null {
  const entry = Array.isArray(payload.entry) ? payload.entry : [];
  const first = entry[0] as JsonRecord | undefined;
  return typeof first?.id === "string" ? first.id : null;
}

function metaGraphBase(config: MetaCloudConfig): string {
  return `https://graph.facebook.com/${config.apiVersion}`;
}

function metaMessagesUrl(config: MetaCloudConfig): string {
  return `${metaGraphBase(config)}/${config.phoneNumberId}/messages`;
}

function metaMediaUrl(config: MetaCloudConfig): string {
  return `${metaGraphBase(config)}/${config.phoneNumberId}/media`;
}

function normalizeWhatsAppRecipient(value: string): string {
  return value.replace(/\D/g, "");
}

function guessMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".mp4")) {
    return "video/mp4";
  }
  if (lower.endsWith(".mov")) {
    return "video/quicktime";
  }
  return "image/jpeg";
}
