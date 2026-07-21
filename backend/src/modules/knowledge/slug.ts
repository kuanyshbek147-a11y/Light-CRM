const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  қ: "q",
  ғ: "g",
  ң: "n",
  ү: "u",
  ұ: "u",
  ө: "o",
  һ: "h",
  і: "i"
};

/** Читаемый slug из заголовка: «Как оплатить» → kak-oplatit */
export function slugifyKnowledgeTitle(title: string): string {
  const lower = title.trim().toLowerCase();
  let out = "";

  for (const ch of lower) {
    if (CYRILLIC_TO_LATIN[ch] !== undefined) {
      out += CYRILLIC_TO_LATIN[ch];
      continue;
    }
    if (/[a-z0-9]/.test(ch)) {
      out += ch;
      continue;
    }
    if (/[\s_./\\|,;:!?()[\]{}"'`«»„“”+—–-]+/.test(ch)) {
      out += "-";
    }
  }

  const cleaned = out
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return cleaned || "instrukciya";
}

export function isLegacyKnowledgeSlug(slug: string): boolean {
  return /^[a-f0-9]{12,32}$/i.test(slug.trim());
}
