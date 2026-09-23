import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GUIDE_CANONICAL_URL,
  GUIDE_HOME_URL,
  GUIDE_PATH,
  GUIDE_TITLE,
  buildGuideDocument,
  guideArticlePlainText,
  guideIntro,
  isCrmWhatsappGuidePath,
  renderGuideDocument
} from "./src/features/guides/guideArticle.ts";

const markdown = readFileSync(new URL("./src/features/guides/crm-whatsapp-kazakhstan.md", import.meta.url), "utf8");

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
  assert.match(html, /Открыть Light CRM/);
  assert.match(html, /запросить демо/);
  assert.equal(html.split(GUIDE_HOME_URL).length - 1, 2);
});

test("текст страницы не добавляет утверждений сверх markdown", () => {
  const doc = buildGuideDocument(markdown);
  const rendered = guideArticlePlainText(doc.blocks).replace(/\s+/g, " ").trim();
  const source = markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:-|\d+\.)\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  assert.equal(rendered, source);
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
});
