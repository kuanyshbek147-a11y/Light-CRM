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
