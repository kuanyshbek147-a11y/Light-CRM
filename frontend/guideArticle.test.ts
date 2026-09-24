import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GUIDE_CANONICAL_URL,
  GUIDE_HOME_URL,
  GUIDE_PATH,
  GUIDE_TITLE,
  STATIC_GUIDES,
  WHATSAPP_CHAT_HISTORY_GUIDE_CANONICAL_URL,
  WHATSAPP_CHAT_HISTORY_GUIDE_DESCRIPTION,
  WHATSAPP_CHAT_HISTORY_GUIDE_PATH,
  WHATSAPP_CHAT_HISTORY_GUIDE_TITLE,
  buildGuideDocument,
  guideArticlePlainText,
  guideIntro,
  isCrmWhatsappGuidePath,
  isPublicGuidePath,
  renderGuideDocument
} from "./src/features/guides/guideArticle.ts";

const markdown = readFileSync(new URL("./src/features/guides/crm-whatsapp-kazakhstan.md", import.meta.url), "utf8");
const historyMarkdown = readFileSync(
  new URL("./src/features/guides/whatsapp-chat-history-in-deal.md", import.meta.url),
  "utf8"
);
const sitemap = readFileSync(new URL("./public/sitemap.xml", import.meta.url), "utf8");

function plainFromMarkdown(source: string): string {
  return source
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:-|\d+\.)\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1")
    .replace(/Подзаголовок:\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

test("публичный путь статьи не требует завершающего слэша", () => {
  assert.equal(isCrmWhatsappGuidePath(GUIDE_PATH), true);
  assert.equal(isCrmWhatsappGuidePath(`${GUIDE_PATH}/`), true);
  assert.equal(isCrmWhatsappGuidePath("/"), false);
  assert.equal(isCrmWhatsappGuidePath("/help/crm"), false);
});

test("заголовок и описание берутся из утверждённого текста", () => {
  const doc = buildGuideDocument(markdown);
  assert.equal(doc.title, GUIDE_TITLE);
  assert.equal(
    doc.description,
    "В Казахстане клиент часто пишет в WhatsApp: спросить цену, уточнить статус, пожаловаться. Если ответы живут только в телефоне менеджера, продажи и поддержка теряют историю. CRM с WhatsApp как раз про это: переписка рядом со сделкой, общая картина для команды."
  );
  assert.equal(guideIntro(doc.blocks), doc.description);
});

test("FAQ, списки и CTA совпадают с файлом статьи", () => {
  const doc = buildGuideDocument(markdown);
  const faq = doc.blocks.find((block) => block.kind === "faq");
  assert.ok(faq && faq.kind === "faq");
  if (!faq || faq.kind !== "faq") return;
  assert.deepEqual(
    faq.items.map((item) => item.question),
    [
      "Можно ли отвечать из CRM, не открывая WhatsApp на телефоне?",
      "Видит ли поддержка переписку продаж?",
      "Что будет с историей, если сотрудник уволился?",
      "Нужен ли WhatsApp Business API?",
      "Подойдёт ли, если продажи и поддержка — одни и те же люди?"
    ]
  );
  assert.equal(faq.items[3]?.answer.map((node) => node.value).join(""), "Да — подключение идёт через WhatsApp Business.");

  const html = doc.bodyHtml;
  assert.match(html, /<h1>CRM с WhatsApp для продаж и поддержки в Казахстане<\/h1>/);
  assert.match(html, /href="https:\/\/light-crm-kz\.netlify\.app\/"/);
  assert.match(html, /class="guideCtaLine"/);
  assert.match(html, /Открыть Light CRM/);
  assert.match(html, /запросить демо/);
  assert.equal(html.split(GUIDE_HOME_URL).length - 1, 2);
});

test("текст страницы не добавляет утверждений сверх markdown", () => {
  const doc = buildGuideDocument(markdown);
  const rendered = guideArticlePlainText(doc.blocks).replace(/\s+/g, " ").trim();
  const source = plainFromMarkdown(markdown);
  assert.equal(rendered, source);
  assert.match(doc.bodyHtml, /чаты, сделки и ответы команды в одном окне/);
  assert.equal(doc.bodyHtml.includes("Подзаголовок:"), false);
});

test("статический документ содержит SEO-теги публичного лендинга", () => {
  const html = renderGuideDocument(markdown, "body{margin:0}");
  assert.match(html, new RegExp(`<title>${GUIDE_TITLE}</title>`));
  assert.match(html, /<meta name="description" content="В Казахстане клиент часто пишет в WhatsApp:/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${GUIDE_CANONICAL_URL}" />`));
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta property="og:description"/);
  assert.match(html, /<meta property="og:url"/);
  assert.match(html, /<meta property="og:locale" content="ru_RU" \/>/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /<html lang="ru">/);
  assert.equal(html.includes(WHATSAPP_CHAT_HISTORY_GUIDE_CANONICAL_URL), false);
});

test("оба публичных гайда открываются по пути со слэшем и без", () => {
  assert.equal(isPublicGuidePath(GUIDE_PATH), true);
  assert.equal(isPublicGuidePath(`${GUIDE_PATH}/`), true);
  assert.equal(isPublicGuidePath(WHATSAPP_CHAT_HISTORY_GUIDE_PATH), true);
  assert.equal(isPublicGuidePath(`${WHATSAPP_CHAT_HISTORY_GUIDE_PATH}/`), true);
  assert.equal(isPublicGuidePath("/"), false);
  assert.equal(isCrmWhatsappGuidePath(WHATSAPP_CHAT_HISTORY_GUIDE_PATH), false);
});

test("гайд про историю в сделке получает свои title, description, canonical и FAQ", () => {
  const guide = STATIC_GUIDES.find((item) => item.path === WHATSAPP_CHAT_HISTORY_GUIDE_PATH);
  assert.ok(guide);
  if (!guide) return;

  const doc = buildGuideDocument(historyMarkdown, {
    canonicalUrl: guide.canonicalUrl,
    description: guide.description
  });
  assert.equal(doc.title, WHATSAPP_CHAT_HISTORY_GUIDE_TITLE);
  assert.equal(doc.description, WHATSAPP_CHAT_HISTORY_GUIDE_DESCRIPTION);
  assert.ok(doc.description.length <= 160);
  assert.equal(doc.canonicalUrl, WHATSAPP_CHAT_HISTORY_GUIDE_CANONICAL_URL);
  assert.equal(doc.description.includes("Спросить цену"), false);

  const faq = doc.blocks.find((block) => block.kind === "faq");
  assert.ok(faq && faq.kind === "faq");
  if (!faq || faq.kind !== "faq") return;
  assert.deepEqual(
    faq.items.map((item) => item.question),
    [
      "Можно ли отвечать в WhatsApp из CRM, не открывая мессенджер на телефоне?",
      "Где лежит история переписки?",
      "Видит ли поддержка переписку продаж?",
      "Что будет с историей, если сотрудник уволился?",
      "Нужен ли WhatsApp Business?"
    ]
  );

  const rendered = guideArticlePlainText(doc.blocks).replace(/\s+/g, " ").trim();
  assert.equal(rendered, plainFromMarkdown(historyMarkdown));
  assert.equal(doc.bodyHtml.includes("Подзаголовок:"), false);
  assert.match(doc.bodyHtml, /href="https:\/\/light-crm-kz\.netlify\.app\/guides\/crm-whatsapp-kazakhstan"/);
  assert.equal(doc.bodyHtml.includes('class="guideCtaLine"'), false);
  assert.equal(doc.bodyHtml.includes("₸"), false);
  assert.equal(/тенге/i.test(doc.bodyHtml), false);

  const html = renderGuideDocument(historyMarkdown, "body{margin:0}", {
    canonicalUrl: guide.canonicalUrl,
    description: guide.description
  });
  assert.equal(html.includes(`<title>${WHATSAPP_CHAT_HISTORY_GUIDE_TITLE}</title>`), true);
  assert.equal(
    html.includes(`<meta name="description" content="${WHATSAPP_CHAT_HISTORY_GUIDE_DESCRIPTION}" />`),
    true
  );
  assert.equal(
    html.includes(`<link rel="canonical" href="${WHATSAPP_CHAT_HISTORY_GUIDE_CANONICAL_URL}" />`),
    true
  );
  assert.equal(
    html.includes(`<meta property="og:url" content="${WHATSAPP_CHAT_HISTORY_GUIDE_CANONICAL_URL}" />`),
    true
  );
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /Где лежит история переписки\?/);
  assert.equal(html.includes(`<link rel="canonical" href="${GUIDE_CANONICAL_URL}" />`), false);
  assert.equal(html.includes(`<meta property="og:url" content="${GUIDE_CANONICAL_URL}" />`), false);
});

test("первый гайд через каталог сохраняет прежние SEO-теги", () => {
  const guide = STATIC_GUIDES[0];
  assert.equal(guide?.path, GUIDE_PATH);
  const doc = buildGuideDocument(markdown, {
    canonicalUrl: guide?.canonicalUrl,
    description: guide?.description
  });
  assert.equal(doc.title, GUIDE_TITLE);
  assert.equal(doc.canonicalUrl, GUIDE_CANONICAL_URL);
  assert.equal(guideIntro(doc.blocks), doc.description);
  assert.match(sitemap, new RegExp(GUIDE_CANONICAL_URL));
  assert.match(sitemap, new RegExp(WHATSAPP_CHAT_HISTORY_GUIDE_CANONICAL_URL));
});
