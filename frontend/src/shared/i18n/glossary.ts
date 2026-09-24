export type BuiltinStageKey = "new" | "qualified" | "proposal" | "won" | "lost";

export type BuiltinStageLabels = Record<BuiltinStageKey, string>;

export const DEFAULT_STAGE_LABELS_RU: BuiltinStageLabels = {
  new: "новая",
  qualified: "Квалифицирована",
  proposal: "предложение",
  won: "выиграна",
  lost: "проиграна"
};

const BUILTIN_STAGE_KEYS = new Set<string>(["new", "qualified", "proposal", "won", "lost"]);

export function formatBuiltinStageLabel(
  stage: string,
  labels: BuiltinStageLabels = DEFAULT_STAGE_LABELS_RU
): string | null {
  const key = stage.trim().toLowerCase();
  if (!BUILTIN_STAGE_KEYS.has(key)) {
    return null;
  }
  return labels[key as BuiltinStageKey];
}

export function formatChannelLabel(channel: string): string {
  switch (channel) {
    case "whatsapp":
      return "WhatsApp";
    case "telegram":
      return "Telegram";
    case "instagram":
      return "Instagram";
    case "web":
      return "Сайт";
    case "email":
      return "Почта";
    default:
      return channel;
  }
}

export function formatDialogStatus(status: string): string {
  if (status === "open") {
    return "открыт";
  }
  if (status === "closed") {
    return "закрыт";
  }
  return status;
}

/** Подписи первого плана. Технические имена — во вторичном тексте. */
export const UI_LABELS_RU = {
  slaFollowUp: "Срок ответа",
  wssUrl: "Адрес соединения",
  wssUrlHint: "WSS URL",
  sipDomain: "Домен АТС",
  sipDomainHint: "SIP domain",
  displayName: "Имя на экране телефона",
  displayNameHint: "Display name",
  iceTurn: "Серверы для звонка через интернет",
  iceTurnHint: "ICE / TURN, JSON",
  sipUsername: "Логин в АТС",
  sipUsernameHint: "SIP username",
  sipPassword: "Пароль в АТС",
  sipPasswordHint: "SIP password",
  telephonyTitle: "Телефон в браузере",
  telephonyTitleHint: "Asterisk WebRTC",
  openaiKey: "Ключ ИИ",
  openaiKeyHint: "OPENAI_API_KEY",
  smtp: "Исходящая почта",
  smtpHint: "SMTP",
  imap: "Входящая почта",
  imapHint: "IMAP",
  webhook: "Адрес уведомлений",
  webhookHint: "Webhook",
  wabaId: "Кабинет WhatsApp",
  wabaIdHint: "WABA ID",
  phoneNumberId: "Номер в WhatsApp",
  phoneNumberIdHint: "Phone Number ID",
  cloudApi: "Облачный WhatsApp",
  cloudApiHint: "Cloud API",
  verifyToken: "Код проверки",
  verifyTokenHint: "Verify token",
  redirectUri: "Адрес возврата",
  redirectUriHint: "Redirect URI",
  igUserId: "Аккаунт Instagram",
  igUserIdHint: "IG User ID",
  appId: "Номер приложения",
  appIdHint: "App ID"
} as const;

const SLA_FOLLOW_UP_TITLE = "sla follow-up";

export function displayTaskTitle(title: string): string {
  if (title.trim().toLowerCase() === SLA_FOLLOW_UP_TITLE) {
    return UI_LABELS_RU.slaFollowUp;
  }
  return title;
}

export function formatIntegrationSource(source: string | null | undefined): string {
  if (source === "workspace") return "этот кабинет";
  if (source === "env") return "общая настройка сервера";
  if (!source) return "—";
  return source;
}
