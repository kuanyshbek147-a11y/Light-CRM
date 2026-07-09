import type { CSSProperties } from "react";

function hexToRgba(hex: string, alpha: number): string | null {
  const clean = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return null;
  }
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function operatorDialogCardStyle(color?: string | null): CSSProperties | undefined {
  if (!color) {
    return undefined;
  }
  const softBg = hexToRgba(color, 0.12);
  const softBorder = hexToRgba(color, 0.45);
  return {
    ["--operator-color" as string]: color,
    ...(softBg ? { background: softBg } : null),
    ...(softBorder ? { borderColor: softBorder } : null)
  };
}
