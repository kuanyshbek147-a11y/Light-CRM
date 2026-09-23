export const GUIDE_PATH = "/guides/crm-whatsapp-kazakhstan";
export const GUIDE_TITLE = "CRM с WhatsApp для продаж и поддержки в Казахстане";
export const GUIDE_CANONICAL_URL = "https://light-crm-kz.netlify.app/guides/crm-whatsapp-kazakhstan";
export const GUIDE_SITE_NAME = "Light CRM";
export const GUIDE_HOME_URL = "https://light-crm-kz.netlify.app/";

export function isCrmWhatsappGuidePath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === GUIDE_PATH;
}

export type InlineNode =
  | { kind: "text"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "link"; value: string; href: string };

export type GuideBlock =
  | { kind: "h1"; inlines: InlineNode[] }
  | { kind: "h2"; inlines: InlineNode[] }
  | { kind: "p"; inlines: InlineNode[]; lead: boolean; cta: boolean }
  | { kind: "ul"; items: InlineNode[][] }
  | { kind: "ol"; items: InlineNode[][] }
  | { kind: "faq"; title: string; items: Array<{ question: string; answer: InlineNode[] }> };

export type GuideDocument = {
  title: string;
  description: string;
  bodyHtml: string;
  jsonLd: string;
  blocks: GuideBlock[];
};

export type GuideHeadTag =
  | { kind: "meta"; attr: "name" | "property"; key: string; content: string }
  | { kind: "link"; rel: string; href: string }
  | { kind: "jsonld"; json: string };

function parseInlines(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) {
      nodes.push({ kind: "text", value: source.slice(last, index) });
    }
    if (match[1] !== undefined) {
      nodes.push({ kind: "strong", value: match[1] });
    } else {
      nodes.push({ kind: "link", value: match[2] ?? "", href: match[3] ?? "" });
    }
    last = index + match[0].length;
  }
  if (last < source.length) {
    nodes.push({ kind: "text", value: source.slice(last) });
  }
  return nodes.filter((node) => node.kind !== "text" || node.value.length > 0);
}

export function inlinePlainText(inlines: InlineNode[]): string {
  return inlines.map((node) => node.value).join("");
}

function paragraphFromLines(lines: string[]): GuideBlock {
  const text = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/ {2,}/g, " ")
    .trim();
  const inlines = parseInlines(text);
  const plain = inlinePlainText(inlines);
  return {
    kind: "p",
    inlines,
    lead: plain.startsWith("Подзаголовок:"),
    cta: inlines.some((node) => node.kind === "link")
  };
}

function parseLooseChunk(chunk: string): GuideBlock[] {
  const lines = chunk.split("\n").map((line) => line.replace(/[ \t]+$/g, ""));
  const listAt = lines.findIndex((line) => /^\s*(?:-|\d+\.)\s+/.test(line));
  if (listAt === -1) {
    return [paragraphFromLines(lines)];
  }

  const listLines = lines.slice(listAt).filter((line) => line.trim());
  const unordered = listLines.every((line) => /^\s*-\s+/.test(line));
  const ordered = listLines.every((line) => /^\s*\d+\.\s+/.test(line));
  if (!unordered && !ordered) {
    return [paragraphFromLines(lines)];
  }

  const blocks: GuideBlock[] = [];
  const intro = lines.slice(0, listAt).filter((line) => line.trim());
  if (intro.length) {
    blocks.push(paragraphFromLines(intro));
  }
  const items = listLines.map((line) =>
    parseInlines(line.replace(/^\s*(?:-|\d+\.)\s+/, "").trim())
  );
  blocks.push(unordered ? { kind: "ul", items } : { kind: "ol", items });
  return blocks;
}

export function parseGuideMarkdown(markdown: string): GuideBlock[] {
  const chunks = markdown.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  const blocks: GuideBlock[] = [];
  let index = 0;

  while (index < chunks.length) {
    const chunk = chunks[index]?.trim() ?? "";
    if (!chunk) {
      index += 1;
      continue;
    }

    if (chunk.startsWith("# ") && !chunk.startsWith("## ")) {
      blocks.push({ kind: "h1", inlines: parseInlines(chunk.slice(2).trim()) });
      index += 1;
      continue;
    }

    if (chunk.startsWith("## ")) {
      const title = chunk.slice(3).trim();
      if (title === "Частые вопросы") {
        const items: Array<{ question: string; answer: InlineNode[] }> = [];
        index += 1;
        while (index < chunks.length && !(chunks[index]?.trim().startsWith("#"))) {
          const lines = (chunks[index] ?? "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          const questionLine = lines[0] ?? "";
          const questionMatch = questionLine.match(/^\*\*(.+)\*\*$/);
          if (!questionMatch) {
            break;
          }
          items.push({
            question: questionMatch[1] ?? "",
            answer: parseInlines(lines.slice(1).join(" "))
          });
          index += 1;
        }
        blocks.push({ kind: "faq", title, items });
        continue;
      }

      blocks.push({ kind: "h2", inlines: parseInlines(title) });
      index += 1;
      continue;
    }

    blocks.push(...parseLooseChunk(chunk));
    index += 1;
  }

  return blocks;
}

export function guideIntro(blocks: GuideBlock[]): string {
  const intro = blocks.find((block) => block.kind === "p" && !block.lead);
  return intro && intro.kind === "p" ? inlinePlainText(intro.inlines) : "";
}

export function guideTitle(blocks: GuideBlock[]): string {
  const heading = blocks.find((block) => block.kind === "h1");
  return heading && heading.kind === "h1" ? inlinePlainText(heading.inlines) : GUIDE_TITLE;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInlines(inlines: InlineNode[]): string {
  return inlines
    .map((node) => {
      if (node.kind === "text") return escapeHtml(node.value);
      if (node.kind === "strong") return `<strong>${escapeHtml(node.value)}</strong>`;
      return `<a href="${escapeHtml(node.href)}">${escapeHtml(node.value)}</a>`;
    })
    .join("");
}

function renderBlock(block: GuideBlock): string {
  if (block.kind === "h1") return `<h1>${renderInlines(block.inlines)}</h1>`;
  if (block.kind === "h2") return `<h2>${renderInlines(block.inlines)}</h2>`;
  if (block.kind === "p") {
    const className = block.lead ? "guideLead" : block.cta ? "guideCtaLine" : "";
    const attr = className ? ` class="${className}"` : "";
    return `<p${attr}>${renderInlines(block.inlines)}</p>`;
  }
  if (block.kind === "ul" || block.kind === "ol") {
    const tag = block.kind;
    const items = block.items.map((item) => `<li>${renderInlines(item)}</li>`).join("");
    return `<${tag}>${items}</${tag}>`;
  }
  const items = block.items
    .map(
      (item) =>
        `<div class="guideFaqItem"><dt>${escapeHtml(item.question)}</dt><dd>${renderInlines(item.answer)}</dd></div>`
    )
    .join("");
  return `<section class="guideFaq" aria-labelledby="guide-faq-title"><h2 id="guide-faq-title">${escapeHtml(
    block.title
  )}</h2><dl>${items}</dl></section>`;
}

function faqJsonLd(blocks: GuideBlock[]): string {
  const faq = blocks.find((block) => block.kind === "faq");
  const mainEntity =
    faq && faq.kind === "faq"
      ? faq.items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: inlinePlainText(item.answer)
          }
        }))
      : [];
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity
  }).replace(/</g, "\\u003c");
}

export function buildGuideDocument(markdown: string): GuideDocument {
  const blocks = parseGuideMarkdown(markdown);
  const title = guideTitle(blocks);
  const description = guideIntro(blocks);
  let body = "";
  let ctaOpen = false;

  for (const block of blocks) {
    const opensCta = block.kind === "h2" && inlinePlainText(block.inlines) === "Попробовать Light CRM";
    if (opensCta) {
      body += `<section class="guideCtaSection">`;
      ctaOpen = true;
    }
    body += renderBlock(block);
  }
  if (ctaOpen) body += "</section>";

  const bodyHtml = `<div class="guidePage"><header class="guideHeader"><a class="guideBrand" href="${escapeHtml(
    GUIDE_HOME_URL
  )}">${escapeHtml(GUIDE_SITE_NAME)}</a></header><article class="guideArticle">${body}</article></div>`;

  return {
    title,
    description,
    bodyHtml,
    jsonLd: faqJsonLd(blocks),
    blocks
  };
}

export function guideHeadTags(doc: GuideDocument): GuideHeadTag[] {
  return [
    { kind: "meta", attr: "name", key: "description", content: doc.description },
    { kind: "link", rel: "canonical", href: GUIDE_CANONICAL_URL },
    { kind: "meta", attr: "property", key: "og:type", content: "article" },
    { kind: "meta", attr: "property", key: "og:locale", content: "ru_RU" },
    { kind: "meta", attr: "property", key: "og:site_name", content: GUIDE_SITE_NAME },
    { kind: "meta", attr: "property", key: "og:title", content: doc.title },
    { kind: "meta", attr: "property", key: "og:description", content: doc.description },
    { kind: "meta", attr: "property", key: "og:url", content: GUIDE_CANONICAL_URL },
    { kind: "meta", attr: "name", key: "twitter:card", content: "summary" },
    { kind: "meta", attr: "name", key: "twitter:title", content: doc.title },
    { kind: "meta", attr: "name", key: "twitter:description", content: doc.description },
    { kind: "jsonld", json: doc.jsonLd }
  ];
}

function renderHeadTag(tag: GuideHeadTag): string {
  if (tag.kind === "link") {
    return `<link rel="${escapeHtml(tag.rel)}" href="${escapeHtml(tag.href)}" />`;
  }
  if (tag.kind === "jsonld") {
    return `<script type="application/ld+json">${tag.json}</script>`;
  }
  return `<meta ${tag.attr}="${escapeHtml(tag.key)}" content="${escapeHtml(tag.content)}" />`;
}

export function renderGuideDocument(markdown: string, css: string): string {
  const doc = buildGuideDocument(markdown);
  const head = guideHeadTags(doc).map(renderHeadTag).join("\n  ");
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(doc.title)}</title>
  ${head}
  <style>
${css}
  </style>
</head>
<body>
${doc.bodyHtml}
</body>
</html>
`;
}

export function guideArticlePlainText(blocks: GuideBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.kind === "h1" || block.kind === "h2" || block.kind === "p") {
      parts.push(inlinePlainText(block.inlines));
    } else if (block.kind === "ul" || block.kind === "ol") {
      for (const item of block.items) parts.push(inlinePlainText(item));
    } else {
      parts.push(block.title);
      for (const item of block.items) {
        parts.push(item.question);
        parts.push(inlinePlainText(item.answer));
      }
    }
  }
  return parts.join("\n");
}
