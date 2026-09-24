export const ADD_CLIENT_UNAVAILABLE_HINT =
  "Ручное добавление клиента пока недоступно: отдельного API нет. Клиент появится из входящего сообщения в подключённом канале.";

export function canCreateDealFromPipeline(conversationCount: number): boolean {
  return conversationCount > 0;
}

export function createDealHint(conversationCount: number): string {
  if (conversationCount > 0) {
    return "Откроется форма «Создать сделку» для выбранного диалога.";
  }
  return "Сделку можно создать только из диалога. Сначала подключите канал и дождитесь сообщения.";
}
