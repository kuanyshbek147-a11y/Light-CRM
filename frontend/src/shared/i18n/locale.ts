export type AppLocale = "ru" | "kk" | "en";

export const DEFAULT_LOCALE: AppLocale = "ru";

const STORAGE_KEY = "lightcrm.locale";

/**
 * TODO(i18n): словари KK и EN в этом MVP не собраны.
 * Переключатель запоминает выбор, но все подписи остаются русскими,
 * чтобы продавец в Казахстане не видел смесь языков.
 * Когда появятся каталоги, подключать их здесь, не размазывая строки по экранам.
 */
export const LOCALE_STUB_NOTE =
  "Казахский и английский появятся в следующей версии. Сейчас интерфейс на русском.";

export function normalizeLocale(value: string | null | undefined): AppLocale {
  if (value === "ru" || value === "kk" || value === "en") {
    return value;
  }
  return DEFAULT_LOCALE;
}

export function readLocale(): AppLocale {
  try {
    return normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function writeLocale(locale: AppLocale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Приватный режим: выбор живёт только до перезагрузки.
  }
  ensureRussianDocumentLang();
}

export function ensureRussianDocumentLang(): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = "ru";
  }
}
