import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexHtml = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const robots = readFileSync(new URL("./public/robots.txt", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./public/sitemap.xml", import.meta.url), "utf8");

const SITE = "https://light-crm-kz.netlify.app";

test("главная отдаёт русский title и description про WhatsApp CRM в Казахстане", () => {
  assert.match(indexHtml, /<title>Light CRM — CRM для WhatsApp в Казахстане<\/title>/);
  assert.match(indexHtml, /<meta\s+name="description"\s+content="CRM для WhatsApp и Telegram в Казахстане:/);
  assert.match(indexHtml, new RegExp(`<link rel="canonical" href="${SITE}/" />`));
  assert.match(indexHtml, /<h1>Управляйте всеми диалогами с клиентами в одном современном окне\.<\/h1>/);
  assert.match(indexHtml, /CRM для WhatsApp в Казахстане/);
  assert.match(indexHtml, /href="\/guides\/crm-whatsapp-kazakhstan"/);
});

test("статическая главная сохраняет демо-вход и запись на демо", () => {
  assert.match(indexHtml, /Демо-доступ/);
  assert.match(indexHtml, /Открыть рабочее пространство/);
  assert.match(indexHtml, />Войти</);
  assert.match(indexHtml, /Войти как менеджер/);
  assert.match(indexHtml, /operator, пароль demo123/);
  assert.match(indexHtml, /https:\/\/wa\.me\/77003131055\?text=/);
  assert.match(indexHtml, />Записаться на демо</);
});

test("robots.txt открывает маркетинг и гайды и закрывает приватные прокси", () => {
  assert.match(robots, /User-agent:\s*\*/);
  assert.match(robots, /Allow:\s*\/\s*$/m);
  assert.match(robots, /Allow:\s*\/guides\//);
  assert.match(robots, /Disallow:\s*\/api\//);
  assert.match(robots, /Disallow:\s*\/uploads\//);
  assert.match(robots, new RegExp(`Sitemap:\\s*${SITE}/sitemap\\.xml`));
  assert.equal(robots.includes("<!doctype html>"), false);
});

test("sitemap.xml содержит главную и публичный гайд", () => {
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(sitemap, new RegExp(`<loc>${SITE}/</loc>`));
  assert.match(sitemap, new RegExp(`<loc>${SITE}/guides/crm-whatsapp-kazakhstan</loc>`));
  assert.equal(sitemap.includes("<!doctype html>"), false);
  assert.equal((sitemap.match(/<loc>/g) || []).length, 3);
});
