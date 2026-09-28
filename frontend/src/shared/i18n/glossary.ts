export type BuiltinStageKey = "new" | "qualified" | "proposal" | "won" | "lost";

export type BuiltinStageLabels = Record<BuiltinStageKey, string>;

export const DEFAULT_STAGE_LABELS_RU: BuiltinStageLabels = {
  new: "Новая",
  qualified: "Квалифицирована",
  proposal: "Предложение",
  won: "Выиграна",
  lost: "Проиграна"
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

const MONEY_FORMAT = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

/** Сумма сделки для экрана: «250 000 ₸» вместо «250000.00». */
export function formatMoney(amount: string | number | null | undefined): string {
  const value = typeof amount === "number" ? amount : Number(String(amount ?? "").replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(value)) {
    return String(amount ?? "");
  }
  return `${MONEY_FORMAT.format(value)} ₸`;
}

// Системные задачи бэкенд создаёт с техническими названиями (по ним же их и ищет) — переводим только на экране.
const SYSTEM_TASK_TITLES_RU: Record<string, string> = {
  "SLA follow-up": "Ответить клиенту: срок ответа истёк",
  "Pricing follow-up": "Вернуться к клиенту по цене"
};

export function formatTaskTitle(title: string): string {
  return SYSTEM_TASK_TITLES_RU[title.trim()] ?? title;
}

// История клиента: бэкенд отдаёт коды действий и JSON-метаданные — на экран выводим человеческий текст.
const ACTIVITY_TITLES_RU: Record<string, string> = {
  seed_initialized: "Учебный пример создан",
  message_sent: "Сообщение отправлено",
  send_failed: "Сообщение не отправлено",
  conversation_failed: "Ошибка в диалоге",
  follow_up_created: "Создано напоминание",
  sla_escalation_acknowledged: "Срок ответа продлён",
  sla_escalation_deferred: "Ответ отложен",
  contact_merged: "Карточки клиента объединены"
};

export type TimelineItem = { kind: string; title: string; detail: string | null };

function parseMetadata(detail: string | null): Record<string, unknown> {
  if (!detail || !detail.trim().startsWith("{")) {
    return {};
  }
  try {
    const value = JSON.parse(detail) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function formatTimelineItem(item: TimelineItem): { title: string; detail: string } {
  if (item.kind !== "activity") {
    return { title: item.title, detail: item.detail || "" };
  }
  const meta = parseMetadata(item.detail);
  const title = ACTIVITY_TITLES_RU[item.title] ?? "Действие в CRM";
  let detail = "";
  if (item.title === "follow_up_created" && typeof meta.title === "string") {
    detail = formatTaskTitle(meta.title);
  } else if (item.title === "sla_escalation_deferred" && typeof meta.minutes === "number") {
    detail = `на ${meta.minutes} мин`;
  }
  return { title, detail };
}

/** «1 чат», «3 чата», «5 чатов»: forms = [одна, две–четыре, много]. */
export function ruPlural(count: number, forms: readonly [string, string, string]): string {
  const n = Math.abs(Math.trunc(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? forms[0]
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? forms[1]
        : forms[2];
  return `${count} ${word}`;
}
