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
  featureType: string;
  sessionInfoVersion: string;
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
  needsCoexistence?: boolean;
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

export async function completeWhatsAppConnect(
  token: string,
  payload: {
    code: string;
    wabaId?: string;
    phoneNumberId?: string;
    webhookPublicBaseUrl?: string;
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
