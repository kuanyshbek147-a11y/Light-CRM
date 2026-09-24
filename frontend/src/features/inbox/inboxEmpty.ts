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
  if (input.conversationCount > 0 && input.channelFilter !== "all") {
    return "channel-filter";
  }
  if (input.search.trim() || input.filtersActive) {
    return "query";
  }
  return "activate";
}
