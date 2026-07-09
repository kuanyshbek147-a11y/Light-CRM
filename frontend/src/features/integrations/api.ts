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
};

export type InstagramConnectResult = {
  ok: boolean;
  connected?: boolean;
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

export async function loadInstagramConnectSetup(): Promise<InstagramConnectSetup> {
  const response = await fetch(`${API_BASE_URL}/integrations/instagram/connect/setup`);
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
  payload: { userAccessToken: string; pageId?: string }
): Promise<InstagramConnectResult> {
  const response = await fetch(`${API_BASE_URL}/integrations/instagram/connect/oauth`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as InstagramConnectResult;
  if (!response.ok) {
    throw new Error(data.error || "Не удалось подключить Instagram через Facebook");
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
