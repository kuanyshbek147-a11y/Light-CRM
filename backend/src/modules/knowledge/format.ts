export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type TocItem = { id: string; title: string };

function headingId(title: string, index: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]+/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
  return `h-${index}-${base || "section"}`;
}

/** Извлекает оглавление из строк ## Заголовок */
export function extractToc(body: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = body.split(/\r?\n/);
  let index = 0;
  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (!match) {
      continue;
    }
    const title = match[1].trim();
    if (!title) {
      continue;
    }
    items.push({ id: headingId(title, index), title });
    index += 1;
  }
  return items;
}

/** Простая разметка: ## заголовки, списки - / 1., абзацы */
export function formatBodyAsHtml(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").trim().split("\n");
  const parts: string[] = [];
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  let headingIndex = 0;

  const flushParagraph = () => {
    if (!paragraph.length) {
      return;
    }
    const text = paragraph.join("<br/>");
    parts.push(`<p>${text}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listType || !listItems.length) {
      listType = null;
      listItems = [];
      return;
    }
    const tag = listType;
    parts.push(`<${tag}>${listItems.map((item) => `<li>${item}</li>`).join("")}</${tag}>`);
    listType = null;
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine;
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      flushParagraph();
      flushList();
      const title = escapeHtml(heading[1].trim());
      const id = headingId(heading[1].trim(), headingIndex);
      headingIndex += 1;
      parts.push(`<h2 id="${escapeHtml(id)}">${title}</h2>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.+)$/);
    if (ul) {
      flushParagraph();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(escapeHtml(ul[1].trim()));
      continue;
    }

    const ol = line.match(/^\d+[.)]\s+(.+)$/);
    if (ol) {
      flushParagraph();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push(escapeHtml(ol[1].trim()));
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraph.push(escapeHtml(line));
  }

  flushParagraph();
  flushList();
  return parts.join("\n") || "<p></p>";
}
