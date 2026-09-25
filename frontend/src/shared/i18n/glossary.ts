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
