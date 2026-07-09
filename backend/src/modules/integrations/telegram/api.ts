import type { TelegramCredentials } from "./credentials";

type TelegramApiResponse<T> = {
  ok: boolean;
  description?: string;
  result?: T;
};

export type TelegramBotProfile = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export type TelegramWebhookInfo = {
  url: string;
  pending_update_count: number;
  last_error_message?: string;
};

async function callTelegramApi<T>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const payload = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new Error(payload.description || `Telegram ${method} failed: ${response.status}`);
  }
  return payload.result;
}

export async function getTelegramBotProfile(botToken: string): Promise<TelegramBotProfile> {
  return callTelegramApi<TelegramBotProfile>(botToken, "getMe");
}

export async function getTelegramWebhookInfo(botToken: string): Promise<TelegramWebhookInfo> {
  return callTelegramApi<TelegramWebhookInfo>(botToken, "getWebhookInfo");
}

export async function setTelegramWebhook(
  credentials: Pick<TelegramCredentials, "botToken" | "webhookSecret">,
  publicBaseUrl: string
): Promise<boolean> {
  const base = publicBaseUrl.replace(/\/+$/, "");
  const webhookUrl = `${base}/api/integrations/telegram/webhook/${credentials.webhookSecret}`;
  const result = await callTelegramApi<boolean>(credentials.botToken, "setWebhook", {
    url: webhookUrl,
    allowed_updates: ["message"],
    drop_pending_updates: false
  });
  return Boolean(result);
}

export async function deleteTelegramWebhook(botToken: string): Promise<boolean> {
  const result = await callTelegramApi<boolean>(botToken, "deleteWebhook", {
    drop_pending_updates: false
  });
  return Boolean(result);
}

export async function sendTelegramTextMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<string | null> {
  const result = await callTelegramApi<{ message_id?: number }>(botToken, "sendMessage", {
    chat_id: chatId,
    text
  });
  return result.message_id ? String(result.message_id) : null;
}
