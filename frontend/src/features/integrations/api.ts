import { API_BASE_URL } from "../../shared/config/api";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

export type WhatsAppConnectSetup = {
  provider: string;
  appId: string | null;
  configId: string | null;
  apiVersion: string;
  flow?: string;
  featureType?: string;
  sessionInfoVersion: string;
  ready?: boolean;
  missing?: string[];
};

export type WhatsAppConnectStatus = {
  connected: boolean;
  wabaId: string | null;
  phoneNumberId: string | null;
  connectedAt: string | null;
  enabled: boolean;
  phone?: {
    display_phone_number?: string;
    status?: string;
    platform_type?: string;
    is_on_biz_app?: boolean;
  } | null;
  messagingReady?: boolean;
  needsRegistration?: boolean;
  needsReconnect?: boolean;
  needsCoexistence?: boolean;
  platformType?: string | null;
  phoneStatus?: string | null;
};

export type WhatsAppConnectCompleteResult = {
  ok: boolean;
  connected?: boolean;
  wabaId?: string;
  phoneNumberId?: string;
  phone?: {
    display_phone_number?: string;
    verified_name?: string;
    status?: string;
    platform_type?: string;
  };
  webhookSubscribed?: boolean;
  registered?: boolean;
  error?: string;
};

export async function loadWhatsAppConnectSetup(): Promise<WhatsAppConnectSetup> {
  const response = await fetch(`${API_BASE_URL}/integrations/whatsapp/connect/setup`);
  if (!response.ok) {
    throw new Error("Не удалось загрузить настройки WhatsApp");
  }
  return (await response.json()) as WhatsAppConnectSetup;
}

export async function loadWhatsAppConnectStatus(token: string): Promise<WhatsAppConnectStatus> {
  const response = await fetch(`${API_BASE_URL}/integrations/whatsapp/connect/status`, {
    headers: authHeaders(token)
  });
  if (!response.ok) {
    throw new Error("Не удалось загрузить статус WhatsApp");
  }
  return (await response.json()) as WhatsAppConnectStatus;
}

export async function registerWhatsAppCloudApi(
  token: string,
  payload?: { registrationPin?: string }
): Promise<{ ok: boolean; registered?: boolean; messagingReady?: boolean; error?: string }> {
  const response = await fetch(`${API_BASE_URL}/integrations/whatsapp/connect/register`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload || {})
  });
  const data = (await response.json()) as {
    ok: boolean;
    registered?: boolean;
    messagingReady?: boolean;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || "Не удалось зарегистрировать номер в Cloud API");
  }
  return data;
}

export async function disconnectWhatsApp(token: string): Promise<{ ok: boolean; connected: boolean }> {
  const response = await fetch(`${API_BASE_URL}/integrations/whatsapp/connect/disconnect`, {
    method: "POST",
    headers: authHeaders(token)
  });
  const data = (await response.json()) as { ok: boolean; connected: boolean; error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Не удалось сбросить подключение WhatsApp");
  }
  return data;
}

export async function completeWhatsAppConnect(
  token: string,
  payload: {
    code: string;
    wabaId?: string;
    phoneNumberId?: string;
    webhookPublicBaseUrl?: string;
    registrationPin?: string;
  }
): Promise<WhatsAppConnectCompleteResult> {
  const response = await fetch(`${API_BASE_URL}/integrations/whatsapp/connect/complete`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as WhatsAppConnectCompleteResult;
  if (!response.ok) {
    throw new Error(data.error || "Не удалось подключить WhatsApp");
  }
  return data;
}

export type InstagramStatus = {
  enabled: boolean;
  missing: string[];
  connected: boolean;
  pageId: string | null;
  igUserId: string | null;
  connectedAt: string | null;
  source: "workspace" | "env" | null;
  webhookPath: string;
  verifyToken: string | null;
};

export type InstagramConnectSetup = {
  appId: string;
  apiVersion: string;
  scopes: string[];
  webhookPath: string;
  verifyToken: string | null;
  mode?: "instagram_login" | "facebook_login";
  redirectUri?: string;
};

export type InstagramConnectResult = {
  ok: boolean;
  connected?: boolean;
  mode?: string;
  pageId?: string;
  pageName?: string | null;
  igUserId?: string | null;
  igUsername?: string | null;
  pageSubscribed?: boolean;
  pages?: Array<{ pageId: string; pageName: string; igUsername: string | null }>;
  error?: string;
};

export async function loadInstagramStatus(token: string): Promise<InstagramStatus> {
  const response = await fetch(`${API_BASE_URL}/integrations/instagram/status`, {
    headers: authHeaders(token)
  });
  if (!response.ok) {
    throw new Error("Не удалось загрузить статус Instagram");
  }
  return (await response.json()) as InstagramStatus;
}

export async function loadInstagramConnectSetup(redirectOrigin?: string): Promise<InstagramConnectSetup> {
  const query = redirectOrigin
    ? `?redirectOrigin=${encodeURIComponent(redirectOrigin)}`
    : "";
  const response = await fetch(`${API_BASE_URL}/integrations/instagram/connect/setup${query}`);
  if (!response.ok) {
    throw new Error("Не удалось загрузить настройки Instagram");
  }
  return (await response.json()) as InstagramConnectSetup;
}

export async function connectInstagram(
  token: string,
  payload: { pageId: string; pageAccessToken: string; igUserId?: string }
): Promise<InstagramConnectResult> {
  const response = await fetch(`${API_BASE_URL}/integrations/instagram/connect`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as InstagramConnectResult;
  if (!response.ok) {
    throw new Error(data.error || "Не удалось подключить Instagram");
  }
  return data;
}

export async function connectInstagramOAuth(
  token: string,
  payload: { code?: string; redirectUri?: string; userAccessToken?: string; pageId?: string }
): Promise<InstagramConnectResult> {
  const response = await fetch(`${API_BASE_URL}/integrations/instagram/connect/oauth`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as InstagramConnectResult;
  if (!response.ok) {
    throw new Error(data.error || "Не удалось подключить Instagram");
  }
  return data;
}

export async function disconnectInstagram(token: string): Promise<{ ok: boolean; connected: boolean }> {
  const response = await fetch(`${API_BASE_URL}/integrations/instagram/disconnect`, {
    method: "POST",
    headers: authHeaders(token)
  });
  const data = (await response.json()) as { ok: boolean; connected: boolean; error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Не удалось отключить Instagram");
  }
  return data;
}

export type TelegramStatus = {
  enabled: boolean;
  missing: string[];
  connected: boolean;
  disabled?: boolean;
  mode: string;
  botUsername: string | null;
  botId: string | null;
  source: "workspace" | "env" | null;
  webhookPath: string | null;
  webhookUrl: string | null;
  pendingUpdates: number;
  lastError: string | null;
  publicBaseUrl: string;
};

export type TelegramConnectResult = {
  ok: boolean;
  connected?: boolean;
  botUsername?: string | null;
  botId?: string;
  webhookSet?: boolean;
  webhookUrl?: string | null;
  webhookPath?: string;
  error?: string;
};

export async function loadTelegramStatus(token: string): Promise<TelegramStatus> {
  const response = await fetch(`${API_BASE_URL}/integrations/telegram/status`, {
    headers: authHeaders(token)
  });
  if (!response.ok) {
    throw new Error("Не удалось загрузить статус Telegram");
  }
  return (await response.json()) as TelegramStatus;
}

export async function connectTelegram(
  token: string,
  payload: { botToken: string; webhookSecret?: string }
): Promise<TelegramConnectResult> {
  const response = await fetch(`${API_BASE_URL}/integrations/telegram/connect`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as TelegramConnectResult;
  if (!response.ok) {
    throw new Error(data.error || "Не удалось подключить Telegram");
  }
  return data;
}

export async function disconnectTelegram(token: string): Promise<{ ok: boolean; connected: boolean }> {
  const response = await fetch(`${API_BASE_URL}/integrations/telegram/disconnect`, {
    method: "POST",
    headers: authHeaders(token)
  });
  const data = (await response.json()) as { ok: boolean; connected: boolean; error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Не удалось отключить Telegram");
  }
  return data;
}

export type WebChatStatus = {
  connected: boolean;
  enabled: boolean;
  widgetId: string | null;
  title: string;
  greeting: string;
  primaryColor: string;
  connectedAt: string | null;
  publicBaseUrl: string;
  widgetScriptUrl: string;
  embedSnippet: string | null;
};

export type WebChatConnectResult = {
  ok: boolean;
  connected?: boolean;
  widgetId?: string;
  title?: string;
  greeting?: string;
  primaryColor?: string;
  embedSnippet?: string;
  widgetScriptUrl?: string;
  error?: string;
};

export async function loadWebChatStatus(token: string): Promise<WebChatStatus> {
  const response = await fetch(`${API_BASE_URL}/integrations/webchat/status`, {
    headers: authHeaders(token)
  });
  if (!response.ok) {
    throw new Error("Не удалось загрузить статус виджета чата");
  }
  return (await response.json()) as WebChatStatus;
}

export async function connectWebChat(
  token: string,
  payload?: { title?: string; greeting?: string; primaryColor?: string }
): Promise<WebChatConnectResult> {
  const response = await fetch(`${API_BASE_URL}/integrations/webchat/connect`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload || {})
  });
  const data = (await response.json()) as WebChatConnectResult;
  if (!response.ok) {
    throw new Error(data.error || "Не удалось включить виджет чата");
  }
  return data;
}

export async function disconnectWebChat(token: string): Promise<{ ok: boolean; connected: boolean }> {
  const response = await fetch(`${API_BASE_URL}/integrations/webchat/disconnect`, {
    method: "POST",
    headers: authHeaders(token)
  });
  const data = (await response.json()) as { ok: boolean; connected: boolean; error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Не удалось отключить виджет чата");
  }
  return data;
}

export type EmailProviderId = "gmail" | "yandex" | "mailru" | "outlook" | "custom";

export type EmailProviderPreset = {
  id: EmailProviderId;
  label: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  hint: string;
};

export type EmailStatus = {
  connected: boolean;
  disabled?: boolean;
  email: string | null;
  displayName: string | null;
  provider: EmailProviderId | null;
  smtpHost: string | null;
  smtpPort: number | null;
  imapHost: string | null;
  imapPort: number | null;
  connectedAt: string | null;
  providers: EmailProviderPreset[];
};

export type EmailConnectResult = {
  ok: boolean;
  connected?: boolean;
  email?: string;
  provider?: EmailProviderId;
  error?: string;
};

export async function loadEmailStatus(token: string): Promise<EmailStatus> {
  const response = await fetch(`${API_BASE_URL}/integrations/email/status`, {
    headers: authHeaders(token)
  });
  if (!response.ok) {
    throw new Error("Не удалось загрузить статус почты");
  }
  return (await response.json()) as EmailStatus;
}

export async function connectEmail(
  token: string,
  payload: {
    email: string;
    password: string;
    displayName?: string;
    provider?: EmailProviderId;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
  }
): Promise<EmailConnectResult> {
  const response = await fetch(`${API_BASE_URL}/integrations/email/connect`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as EmailConnectResult;
  if (!response.ok) {
    throw new Error(data.error || "Не удалось подключить почту");
  }
  return data;
}

export async function disconnectEmail(token: string): Promise<{ ok: boolean; connected: boolean }> {
  const response = await fetch(`${API_BASE_URL}/integrations/email/disconnect`, {
    method: "POST",
    headers: authHeaders(token)
  });
  const data = (await response.json()) as { ok: boolean; connected: boolean; error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Не удалось отключить почту");
  }
  return data;
}

export type AutoReplySettings = {
  enabled: boolean;
  mode: "rules" | "ai";
  defaultText: string;
  systemPrompt: string;
  firstOnly: boolean;
  aiConfigured: boolean;
};

export async function loadAutoReplySettings(token: string): Promise<AutoReplySettings> {
  const response = await fetch(`${API_BASE_URL}/integrations/auto-reply/status`, {
    headers: authHeaders(token)
  });
  if (!response.ok) {
    throw new Error("Не удалось загрузить настройки автоответчика");
  }
  return (await response.json()) as AutoReplySettings;
}

export async function saveAutoReplySettings(
  token: string,
  payload: Partial<{
    enabled: boolean;
    mode: "rules" | "ai";
    defaultText: string;
    systemPrompt: string;
    firstOnly: boolean;
  }>
): Promise<AutoReplySettings> {
  const response = await fetch(`${API_BASE_URL}/integrations/auto-reply/settings`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as AutoReplySettings & { ok?: boolean; error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Не удалось сохранить автоответчик");
  }
  return data;
}
