import { Router } from "express";
import { query } from "../../db";
import { escapeHtml, extractToc, formatBodyAsHtml } from "./format";

/** Публичная база для ссылок клиентам — домен сайта, не Render. */
function knowledgePublicBaseUrl(): string {
  return (
    process.env.KNOWLEDGE_PUBLIC_BASE_URL ||
    process.env.FRONTEND_PUBLIC_URL ||
    "https://light-crm-kz.netlify.app"
  ).replace(/\/$/, "");
}

export function buildKnowledgeShareUrl(publicSlug: string): string {
  return `${knowledgePublicBaseUrl()}/help/${encodeURIComponent(publicSlug)}`;
}

function unavailablePage(message: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Инструкция недоступна</title>
  <style>
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #f1f5f9; color: #0f172a; }
    .wrap { max-width: 480px; margin: 12vh auto; padding: 24px 18px; text-align: center; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 28px 22px; }
    h1 { font-size: 22px; margin: 0 0 10px; }
    p { color: #64748b; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrap"><div class="card"><h1>Инструкция недоступна</h1><p>${escapeHtml(message)}</p></div></div>
</body>
</html>`;
}

export function createPublicKnowledgeRouter(): Router {
  const router = Router();

  router.get("/:slug", async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      res.status(404).send("Not found");
      return;
    }

    const rows = await query<{
      id: string;
      title: string;
      body: string | null;
      summary: string | null;
      category: string | null;
      url: string | null;
      status: string;
      expires_at: string | null;
      is_archived: boolean;
      workspace_id: string;
      workspace_name: string | null;
    }>(
      `SELECT a.id, a.title, a.body, a.summary, a.category, a.url,
              a.status, a.expires_at, a.is_archived, a.workspace_id,
              w.name AS workspace_name
       FROM knowledge_articles a
       LEFT JOIN workspaces w ON w.id = a.workspace_id
       WHERE a.public_slug = $1
       LIMIT 1`,
      [slug]
    );

    const article = rows[0];
    if (!article) {
      res.status(404).type("html").send(unavailablePage("Статья не найдена или ссылка устарела."));
      return;
    }

    if (article.is_archived || article.status !== "published") {
      res.status(404).type("html").send(unavailablePage("Эта инструкция пока не опубликована."));
      return;
    }

    if (article.expires_at && new Date(article.expires_at).getTime() <= Date.now()) {
      res.status(410).type("html").send(unavailablePage("Срок действия этой ссылки истёк."));
      return;
    }

    await query(`UPDATE knowledge_articles SET view_count = view_count + 1 WHERE id = $1`, [article.id]);

    const settings = await query<{ key: string; value: string }>(
      `SELECT key, value FROM workspace_settings
       WHERE workspace_id = $1 AND key IN ('knowledge_brand_name', 'knowledge_contact_url')`,
      [article.workspace_id]
    );
    const settingsMap = Object.fromEntries(settings.map((row) => [row.key, row.value]));
    const brandName =
      (settingsMap.knowledge_brand_name || "").trim() ||
      (article.workspace_name || "").trim() ||
      "Инструкция";
    const contactUrl = (settingsMap.knowledge_contact_url || "").trim();

    const sourceBody = article.body?.trim() || article.summary?.trim() || "";
    const toc = extractToc(sourceBody);
    const bodyHtml = sourceBody
      ? formatBodyAsHtml(sourceBody)
      : "<p>Текст статьи пока не заполнен.</p>";

    const tocHtml =
      toc.length > 1
        ? `<nav class="toc"><div class="tocTitle">Содержание</div><ol>${toc
            .map((item) => `<li><a href="#${escapeHtml(item.id)}">${escapeHtml(item.title)}</a></li>`)
            .join("")}</ol></nav>`
        : "";

    const external =
      article.url?.trim() && /^https?:\/\//i.test(article.url.trim())
        ? `<p><a href="${escapeHtml(article.url.trim())}" rel="noopener noreferrer">Открыть доп. материал</a></p>`
        : "";

    const categoryBadge = article.category
      ? `<span class="badge">${escapeHtml(article.category)}</span>`
      : `<span class="badge">Инструкция</span>`;

    const contactCta =
      contactUrl && /^https?:\/\//i.test(contactUrl)
        ? `<a class="cta" href="${escapeHtml(contactUrl)}" rel="noopener noreferrer">Написать нам</a>`
        : "";

    const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(article.title)} · ${escapeHtml(brandName)}</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: linear-gradient(165deg, #e8f4f2 0%, #f8fafc 42%, #eef2ff 100%);
      color: #0f172a;
      min-height: 100vh;
      padding-bottom: ${contactCta ? "88px" : "24px"};
    }
    .wrap { max-width: 720px; margin: 0 auto; padding: 20px 16px 40px; }
    .brand { font-size: 13px; font-weight: 700; color: #0f766e; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 14px; }
    .card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 24px 20px;
      box-shadow: 0 12px 36px rgba(15, 23, 42, 0.07);
    }
    .badge {
      display: inline-block;
      padding: 5px 11px;
      border-radius: 999px;
      background: #ecfeff;
      color: #0e7490;
      font-size: 12px;
      font-weight: 700;
    }
    h1 { margin: 14px 0 10px; font-size: clamp(22px, 5vw, 30px); line-height: 1.25; letter-spacing: -0.02em; }
    h2 { margin: 22px 0 10px; font-size: 1.15rem; scroll-margin-top: 16px; }
    .summary { color: #475569; margin: 0 0 18px; font-size: 15px; line-height: 1.5; }
    .toc { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; margin: 0 0 20px; }
    .tocTitle { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
    .toc ol { margin: 0; padding-left: 18px; }
    .toc li { margin: 4px 0; }
    .content { line-height: 1.7; font-size: 16.5px; }
    .content p { margin: 0 0 14px; }
    .content ul, .content ol { margin: 0 0 14px; padding-left: 1.25em; }
    .content li { margin: 4px 0; }
    a { color: #0e7490; }
    .foot { margin-top: 26px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px; }
    .ctaBar {
      position: fixed; left: 0; right: 0; bottom: 0;
      padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
      background: rgba(255,255,255,0.92);
      border-top: 1px solid #e2e8f0;
      backdrop-filter: blur(8px);
      display: flex; justify-content: center;
    }
    .cta {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 48px; padding: 0 22px; border-radius: 14px;
      background: #0f766e; color: #fff !important; text-decoration: none;
      font-weight: 700; font-size: 15px; width: min(420px, 100%);
    }
    @media (min-width: 768px) {
      .wrap { padding: 32px 18px 48px; }
      .card { padding: 28px 26px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">${escapeHtml(brandName)}</div>
    <article class="card">
      ${categoryBadge}
      <h1>${escapeHtml(article.title)}</h1>
      ${article.summary ? `<p class="summary">${escapeHtml(article.summary)}</p>` : ""}
      ${tocHtml}
      <div class="content">${bodyHtml}</div>
      ${external}
      <div class="foot">${escapeHtml(brandName)}</div>
    </article>
  </div>
  ${contactCta ? `<div class="ctaBar">${contactCta}</div>` : ""}
</body>
</html>`;

    res.type("html").send(html);
  });

  return router;
}
