import type { CSSProperties } from "react";

// Цвет оператора — полоска слева и имя, а не заливка всей карточки: иначе список пестрит.
export function operatorDialogCardStyle(color?: string | null): CSSProperties | undefined {
  if (!color) {
    return undefined;
  }
  return { ["--operator-color" as string]: color };
}
