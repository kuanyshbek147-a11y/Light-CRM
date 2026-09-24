export const SAVE_NETWORK_ERROR =
  "Не удалось сохранить. Проверьте интернет и попробуйте ещё раз.";

export function isNetworkFetchError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  if (error instanceof TypeError) return true;
  return /failed to fetch|networkerror|network request failed|load failed|\bnetwork\b/i.test(message);
}

/** Сетевой сбой fetch всегда одна фраза. Уже русский текст ошибки оставляем. */
export function plainFetchError(error: unknown, fallback: string): string {
  if (isNetworkFetchError(error)) return SAVE_NETWORK_ERROR;
  if (error instanceof Error) {
    const message = error.message.trim();
    if (/[А-Яа-яЁё]/.test(message) && !/failed to fetch/i.test(message)) return message;
  }
  return fallback;
}

export async function httpJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`http_error_${response.status}`);
  }
  return (await response.json()) as T;
}
