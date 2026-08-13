import { API_BASE_URL } from "../../shared/config/api";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type TelephonySettings = {
  enabled: boolean;
  wssUrl: string;
  domain: string;
  iceServers: IceServerConfig[];
  outboundPrefix: string;
};

export type TelephonyExtension = {
  id: string;
  workspace_id: string;
  user_id: string;
  sip_username: string;
  display_name: string;
  is_active: boolean;
  user_name?: string | null;
  user_role?: string | null;
  has_password: boolean;
  updated_at: string;
};

export type TelephonySession = {
  enabled: boolean;
  configured: boolean;
  wssUrl: string;
  domain: string;
  iceServers: IceServerConfig[];
  outboundPrefix: string;
  extension: {
    sipUsername: string;
    sipPassword: string;
    displayName: string;
  } | null;
};

export type CallLogResult = {
  id: string;
  conversation_id: string | null;
  contact_id: string | null;
  contact_name?: string | null;
  direction: "in" | "out";
  remote_number: string;
  status: string;
  duration_sec: number | null;
};

export async function loadTelephonySettings(token: string): Promise<TelephonySettings> {
  const response = await fetch(`${API_BASE_URL}/integrations/telephony/settings`, {
    headers: authHeaders(token)
  });
  if (!response.ok) {
    throw new Error("Не удалось загрузить настройки телефонии");
  }
  return (await response.json()) as TelephonySettings;
}

export async function saveTelephonySettings(
  token: string,
  payload: Partial<TelephonySettings>
): Promise<TelephonySettings> {
  const response = await fetch(`${API_BASE_URL}/integrations/telephony/settings`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Не удалось сохранить настройки");
  }
  return (await response.json()) as TelephonySettings;
}

export async function loadTelephonyExtensions(
  token: string
): Promise<{
  extensions: TelephonyExtension[];
  users: Array<{ id: string; full_name: string; role: string }>;
}> {
  const response = await fetch(`${API_BASE_URL}/integrations/telephony/extensions`, {
    headers: authHeaders(token)
  });
  if (!response.ok) {
    throw new Error("Не удалось загрузить SIP-учётки");
  }
  return (await response.json()) as {
    extensions: TelephonyExtension[];
    users: Array<{ id: string; full_name: string; role: string }>;
  };
}

export async function saveTelephonyExtension(
  token: string,
  payload: {
    userId: string;
    sipUsername: string;
    sipPassword?: string;
    displayName?: string;
    isActive?: boolean;
  }
): Promise<TelephonyExtension> {
  const response = await fetch(`${API_BASE_URL}/integrations/telephony/extensions`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Не удалось сохранить extension");
  }
  return (await response.json()) as TelephonyExtension;
}

export async function deleteTelephonyExtension(token: string, id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/integrations/telephony/extensions/${id}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });
  if (!response.ok) {
    throw new Error("Не удалось удалить extension");
  }
}

export async function loadTelephonySession(token: string): Promise<TelephonySession> {
  const response = await fetch(`${API_BASE_URL}/integrations/telephony/session`, {
    headers: authHeaders(token)
  });
  if (!response.ok) {
    throw new Error("Не удалось загрузить SIP-сессию");
  }
  return (await response.json()) as TelephonySession;
}

export async function reportTelephonyCall(
  token: string,
  payload: {
    direction: "in" | "out";
    remoteNumber: string;
    status: "ringing" | "started" | "answered" | "ended" | "missed" | "failed";
    sipCallId?: string;
    callLogId?: string;
    durationSec?: number;
  }
): Promise<CallLogResult | null> {
  const response = await fetch(`${API_BASE_URL}/integrations/telephony/calls`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as CallLogResult;
}

export const TELEPHONY_DIAL_EVENT = "telephony:dial";

export function requestTelephonyDial(phone: string): void {
  window.dispatchEvent(new CustomEvent(TELEPHONY_DIAL_EVENT, { detail: { phone } }));
}
