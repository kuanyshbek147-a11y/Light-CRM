export function canCreateDealFromPipeline(conversationCount: number): boolean {
  return conversationCount > 0;
}

export function createDealHint(conversationCount: number, isAdmin = true): string {
  if (conversationCount > 0) {
    return "Сделка создаётся из уже открытого диалога.";
  }
  if (!isAdmin) {
    return "Канал подключает администратор. Сделка появится из диалога.";
  }
  return "Сделку создают из диалога. Сначала подключите канал.";
}
