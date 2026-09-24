export type InboxEmptyKind = "channel-filter" | "query" | "activate";

export function inboxFiltersActive(filters: object): boolean {
  return Object.values(filters).some((value) => String(value ?? "").trim() !== "");
}

/**
 * Пустой список диалогов: узкий фильтр канала, поиск или настоящая пустая активация.
 * Поиск важнее чеклиста «подключите канал», иначе пустой результат выглядит как тупик.
 */
export function resolveInboxEmptyKind(input: {
  loading: boolean;
  conversationCount: number;
  visibleCount: number;
  channelFilter: string;
  search: string;
  filtersActive: boolean;
}): InboxEmptyKind | null {
  if (input.loading || input.visibleCount > 0) {
    return null;
  }
  if (input.search.trim() || input.filtersActive) {
    return "query";
  }
  if (input.channelFilter !== "all") {
    return "channel-filter";
  }
  return "activate";
}

export type IntegrationsFocusChannel = "whatsapp" | "telegram" | "instagram" | "email" | "web";

/** Пустой фильтр канала открывает карточку этого канала, а не всегда WhatsApp. */
export function integrationsFocusForChannel(channel: string): IntegrationsFocusChannel {
  if (channel === "telegram" || channel === "instagram" || channel === "email" || channel === "web") {
    return channel;
  }
  return "whatsapp";
}
