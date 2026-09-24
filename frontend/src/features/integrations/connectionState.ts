export const CONNECT_BUTTON_RESET_MS = 2000;

export const INSTAGRAM_OAUTH_PENDING_KEY = "instagram_oauth_pending";

export type LinkBadgeKind = "connected" | "disconnected" | "error";

export function resolveLinkBadge(input: {
  serverConnected: boolean;
  attemptFailed: boolean;
  dismissedFailure: boolean;
  connectedLabel: string;
}): { kind: LinkBadgeKind; label: string } {
  if (input.attemptFailed) {
    return { kind: "error", label: "Ошибка подключения" };
  }
  if (input.dismissedFailure || !input.serverConnected) {
    return { kind: "disconnected", label: "Не подключено" };
  }
  return { kind: "connected", label: input.connectedLabel };
}

export type InstagramOAuthReturn =
  | { kind: "ignore" }
  | { kind: "exchange" }
  | { kind: "cancelled"; message: string };

export function plainInstagramOAuthError(error: string | null, description: string | null): string {
  const code = (error || "").toLowerCase();
  const details = description || "";
  if (
    code === "access_denied" ||
    code.includes("cancel") ||
    /denied|cancel|отмен|не заверш/i.test(`${code} ${details}`)
  ) {
    return "Вход в Instagram отменён или не завершён.";
  }
  const readable = (details || error || "").trim();
  if (/[А-Яа-яЁё]/.test(readable) && readable.length <= 180) {
    return readable;
  }
  return "Не удалось подключить Instagram. Повторите вход.";
}

export function interpretInstagramOAuthReturn(input: {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
  pending: boolean;
}): InstagramOAuthReturn {
  if (input.code) {
    return { kind: "exchange" };
  }
  if (input.error || input.errorDescription) {
    return {
      kind: "cancelled",
      message: plainInstagramOAuthError(input.error, input.errorDescription)
    };
  }
  if (input.pending) {
    return { kind: "cancelled", message: "Вход в Instagram отменён или не завершён." };
  }
  return { kind: "ignore" };
}

export const WHATSAPP_POPUP_BLOCKED =
  "Не удалось открыть окно входа WhatsApp. Нажмите «Повторить подключение».";

export function plainWhatsAppOAuthError(raw: string): string {
  if (/отмен|не заверш|cancel|closed/i.test(raw)) {
    return "Подключение WhatsApp отменено или не завершено.";
  }
  if (/не ответил|дождаться|timeout/i.test(raw)) {
    return "Не удалось дождаться ответа. Нажмите «Повторить подключение».";
  }
  if (/открыть окно|sdk|загружается/i.test(raw)) {
    return WHATSAPP_POPUP_BLOCKED;
  }
  if (/[А-Яа-яЁё]/.test(raw) && raw.length <= 160) {
    return raw;
  }
  return "Не удалось подключить WhatsApp. Повторите попытку.";
}

const TELEGRAM_BOT_TOKEN = /^\d{6,12}:[A-Za-z0-9_-]{20,}$/;

export function telegramTokenProblem(token: string): "empty" | "invalid" | null {
  const value = token.trim();
  if (!value) {
    return "empty";
  }
  if (!TELEGRAM_BOT_TOKEN.test(value)) {
    return "invalid";
  }
  return null;
}

export function telegramTokenMessage(problem: "empty" | "invalid"): string {
  if (problem === "empty") {
    return "Вставьте ключ бота от @BotFather";
  }
  return "Ключ неверный. Скопируйте его целиком у @BotFather — он выглядит как 123456789:AA…";
}

export function describeTelegramConnectError(raw: string): string {
  const text = raw.trim();
  if (!text || /unauthorized|not found|invalid token|bot token|401|404/i.test(text)) {
    return "Telegram не принял ключ. Проверьте, что скопировали его у @BotFather без пробелов.";
  }
  if (/abort|timeout|failed to fetch|network|econnreset|enotfound/i.test(text)) {
    return "Не удалось связаться с Telegram. Проверьте интернет и попробуйте снова.";
  }
  if (/непонятный ответ/i.test(text)) {
    return text;
  }
  if (/[А-Яа-яЁё]/.test(text)) {
    return text;
  }
  return "Не удалось подключить Telegram. Проверьте ключ и попробуйте снова.";
}
