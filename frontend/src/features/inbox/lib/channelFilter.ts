export const INBOX_CHANNEL_FILTERS = ["all", "whatsapp", "telegram", "instagram", "web", "email"] as const;

export type InboxChannelFilter = (typeof INBOX_CHANNEL_FILTERS)[number];

export function conversationsForChannel<T extends { channel: string }>(
  conversations: readonly T[],
  channelFilter: InboxChannelFilter
): T[] {
  if (channelFilter === "all") return [...conversations];
  return conversations.filter((item) => item.channel === channelFilter);
}

/** Фильтр канала включён и в списке не осталось ни одного чата. */
export function channelFilterIsEmpty(
  conversations: readonly { channel: string }[],
  channelFilter: InboxChannelFilter
): boolean {
  return channelFilter !== "all" && conversationsForChannel(conversations, channelFilter).length === 0;
}
