export const DEFAULT_LOCALE = "ru" as const;

/**
 * TODO(i18n): каталоги KK и EN не входят в сегодняшний MVP.
 * Интерфейс только русский, переключателя языка нет.
 */
export function ensureRussianDocumentLang(): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = "ru";
  }
}
