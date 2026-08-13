import { Router } from "express";
import { escapeHtml, formatBodyAsHtml } from "../knowledge/format";
import {
  buildLandingDestinationUrl,
  buildLandingPublicUrl,
  buildTrackedCtaPath,
  bumpLandingView,
  getPublishedLandingBySlug,
  readUtmFromQuery,
  recordLandingClick
} from "./landings";

function mediaPublicBaseUrl(): string {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "https://light-crm-backend.onrender.com"
  ).replace(/\/+$/, "");
}

function toAbsoluteUrl(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${mediaPublicBaseUrl()}${value}`;
  return value;
}

function isSocialCrawler(userAgent: string | undefined): boolean {
  const ua = String(userAgent || "").toLowerCase();
  if (!ua) return false;
  return /facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|googlebot|bingbot|embedly|quora link preview|pinterest|vkshare|applebot/i.test(
    ua
  );
}

function unavailablePage(message: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Страница недоступна</title>
  <style>
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #f4f6f8; color: #14212b; }
    .wrap { max-width: 480px; margin: 14vh auto; padding: 24px 18px; text-align: center; }
    .card { background: #fff; border: 1px solid #dde3ea; border-radius: 16px; padding: 28px 22px; }
    h1 { font-size: 22px; margin: 0 0 10px; }
    p { color: #5b6b7c; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrap"><div class="card"><h1>Страница недоступна</h1><p>${escapeHtml(message)}</p></div></div>
</body>
</html>`;
}

export function createPublicLandingRouter(): Router {
  const router = Router();

  router.get("/:slug/go", async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      res.status(404).type("html").send(unavailablePage("Страница не найдена."));
      return;
    }

    const landing = await getPublishedLandingBySlug(slug);
    if (!landing) {
      res.status(404).type("html").send(unavailablePage("Лендинг не найден или ещё не опубликован."));
      return;
    }

    const utm = readUtmFromQuery(req.query as Record<string, unknown>);
    await recordLandingClick({
      landing,
      utm,
      userAgent: req.get("user-agent")
    });

    const destination = buildLandingDestinationUrl(landing, utm);
    if (!destination) {
      res.status(400).type("html").send(unavailablePage("Для лендинга не задан WhatsApp или ссылка CTA."));
      return;
    }

    res.redirect(302, destination);
  });

  router.get("/:slug", async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      res.status(404).type("html").send(unavailablePage("Страница не найдена."));
      return;
    }

    const landing = await getPublishedLandingBySlug(slug);
    if (!landing) {
      res.status(404).type("html").send(unavailablePage("Лендинг не найден или ещё не опубликован."));
      return;
    }

    if (!isSocialCrawler(req.get("user-agent"))) {
      await bumpLandingView(landing.id);
    }

    const bodyHtml = landing.body.trim() ? formatBodyAsHtml(landing.body) : "";
    const hasCta = Boolean(landing.cta_url || landing.phone);
    const trackedPath = buildTrackedCtaPath(landing.slug);
    const cta = hasCta
      ? `<a class="cta" id="landing-cta" href="${escapeHtml(trackedPath)}">${escapeHtml(
          landing.cta_label || "Связаться"
        )}</a>`
      : "";
    const heroSrc = toAbsoluteUrl(landing.hero_image_url);
    const heroImage = heroSrc
      ? `<div class="heroMedia" style="background-image:url('${escapeHtml(heroSrc)}')" role="img" aria-label=""></div>`
      : `<div class="heroMedia heroFallback" aria-hidden="true"></div>`;

    const pageTitle = `${landing.headline} · ${landing.brand_name}`.trim();
    const pageDescription = (landing.subheadline || landing.headline || landing.brand_name).trim();
    const canonicalUrl = buildLandingPublicUrl(landing.slug);
    const ogImage = heroSrc;
    const ogImageTags = ogImage
      ? `
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(ogImage)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />`
      : "";

    const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(pageDescription)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="ru_RU" />
  <meta property="og:site_name" content="${escapeHtml(landing.brand_name || "Light CRM")}" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(pageDescription)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />${ogImageTags}
  <meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(pageDescription)}" />
  <style>
    :root {
      --ink: #14212b;
      --muted: #5b6b7c;
      --sand: #f3efe6;
      --leaf: #1f6b4f;
      --leaf-deep: #164c38;
      --line: rgba(20, 33, 43, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Trebuchet MS", system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 500px at 10% -10%, #dceee6 0%, transparent 55%),
        radial-gradient(900px 420px at 100% 0%, #efe6d4 0%, transparent 50%),
        linear-gradient(180deg, #f7f4ee 0%, #eef2f4 100%);
      min-height: 100vh;
    }
    .hero {
      position: relative;
      min-height: min(88vh, 760px);
      display: grid;
      grid-template-rows: 1fr;
      overflow: hidden;
    }
    .heroMedia {
      position: absolute; inset: 0;
      background-size: cover;
      background-position: center;
      filter: saturate(0.95) contrast(1.02);
    }
    .heroFallback {
      background:
        linear-gradient(135deg, rgba(31,107,79,0.88), rgba(20,33,43,0.55)),
        repeating-linear-gradient(-32deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 14px),
        #1f6b4f;
    }
    .hero::after {
      content: "";
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(10,16,20,0.18) 0%, rgba(10,16,20,0.55) 55%, rgba(10,16,20,0.78) 100%);
    }
    .heroInner {
      position: relative;
      z-index: 1;
      width: min(920px, calc(100% - 32px));
      margin: auto;
      padding: 48px 0 56px;
      color: #fff;
      animation: rise 700ms ease both;
    }
    .brand {
      font-size: clamp(28px, 6vw, 54px);
      line-height: 1.05;
      letter-spacing: -0.03em;
      font-weight: 800;
      margin: 0 0 18px;
      max-width: 14ch;
    }
    .headline {
      font-size: clamp(18px, 2.6vw, 26px);
      font-weight: 600;
      margin: 0 0 10px;
      max-width: 28ch;
    }
    .sub {
      margin: 0 0 28px;
      color: rgba(255,255,255,0.86);
      font-size: 16px;
      line-height: 1.5;
      max-width: 42ch;
    }
    .ctaGroup { display: flex; flex-wrap: wrap; gap: 12px; }
    .cta {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 48px; padding: 0 22px; border-radius: 12px;
      background: #fff; color: var(--leaf-deep) !important;
      text-decoration: none; font-weight: 750; font-size: 15px;
      transition: transform 160ms ease, box-shadow 160ms ease;
      box-shadow: 0 10px 28px rgba(0,0,0,0.18);
    }
    .cta:hover { transform: translateY(-1px); }
    .section {
      width: min(760px, calc(100% - 32px));
      margin: 0 auto;
      padding: 36px 0 64px;
      animation: rise 900ms 80ms ease both;
    }
    .content {
      font-size: 17px;
      line-height: 1.7;
      color: var(--ink);
    }
    .content p { margin: 0 0 14px; }
    .content ul, .content ol { margin: 0 0 14px; padding-left: 1.2em; }
    .foot {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 13px;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 640px) {
      .hero { min-height: 78vh; }
      .heroInner { padding: 36px 0 44px; }
    }
  </style>
</head>
<body>
  <header class="hero">
    ${heroImage}
    <div class="heroInner">
      <h1 class="brand">${escapeHtml(landing.brand_name)}</h1>
      <p class="headline">${escapeHtml(landing.headline)}</p>
      ${landing.subheadline ? `<p class="sub">${escapeHtml(landing.subheadline)}</p>` : ""}
      ${cta ? `<div class="ctaGroup">${cta}</div>` : ""}
    </div>
  </header>
  ${
    bodyHtml
      ? `<main class="section"><div class="content">${bodyHtml}</div><div class="foot">${escapeHtml(
          landing.brand_name
        )}</div></main>`
      : ""
  }
  <script>
    (function () {
      var a = document.getElementById("landing-cta");
      if (!a) return;
      var q = window.location.search || "";
      if (!q) return;
      var base = a.getAttribute("href") || "";
      a.setAttribute("href", base.split("?")[0] + q);
    })();
  </script>
</body>
</html>`;

    res.type("html").send(html);
  });

  return router;
}
