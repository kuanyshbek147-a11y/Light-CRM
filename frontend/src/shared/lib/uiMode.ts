// Вид кабинета: «full» — вся CRM (меню, воронка, задачи), «simple» — только чаты, как в WhatsApp.
// Выбор живёт в localStorage: на телефоне и в приложении он сохраняется между запусками.

import type { AppSection } from "./sectionRoute";

export type UiMode = "full" | "simple";

export const UI_MODE_KEY = "lightcrm.uiMode";

type ModeStorage = Pick<Storage, "getItem" | "setItem">;

export function parseUiMode(raw: string | null | undefined): UiMode {
  return raw === "simple" ? "simple" : "full";
}

export function readUiMode(storage: ModeStorage | null | undefined): UiMode {
  try {
    return parseUiMode(storage?.getItem(UI_MODE_KEY));
  } catch {
    return "full";
  }
}

export function writeUiMode(storage: ModeStorage | null | undefined, mode: UiMode): void {
  try {
    storage?.setItem(UI_MODE_KEY, mode);
  } catch {
    /* приватный режим — просто не запоминаем */
  }
}

/** В простом виде открыты только чаты; остальные разделы — через «Полная CRM». */
export function sectionForUiMode(mode: UiMode, section: AppSection): AppSection {
  if (mode === "simple" && section !== "platform") {
    return "dialogs";
  }
  return section;
}

/** localStorage, если браузер его даёт (в приватном режиме доступ может бросить исключение). */
export function browserStorage(): ModeStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}
