export const ADD_CLIENT_UNAVAILABLE_HINT =
  "Клиенты появляются сами, когда пишут в подключённый WhatsApp, Instagram или Telegram.";

export function canCreateDealFromPipeline(conversationCount: number): boolean {
  return conversationCount > 0;
}

export function createDealHint(conversationCount: number): string {
  if (conversationCount > 0) {
    return "Откроется форма «Создать сделку» для выбранного диалога.";
  }
  return "Сделку можно создать только из диалога. Сначала подключите канал и дождитесь сообщения.";
}
