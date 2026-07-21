import { Router } from "express";
import { query } from "../../db";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBodyAsHtml(body: string): string {
  const escaped = escapeHtml(body.trim());
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

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

export function createPublicKnowledgeRouter(): Router {
  const router = Router();

  router.get("/:slug", async (req, res) => {
    const slug = String(req.params.slug || "").trim();
    if (!slug) {
      res.status(404).send("Not found");
      return;
    }

    const rows = await query<{
      title: string;
      body: string | null;
      summary: string | null;
      category: string | null;
      url: string | null;
    }>(
      `SELECT title, body, summary, category, url
       FROM knowledge_articles
       WHERE public_slug = $1
       LIMIT 1`,
      [slug]
    );

    const article = rows[0];
    if (!article) {
      res.status(404).type("html").send(`<!doctype html><html><body><p>Статья не найдена</p></body></html>`);
      return;
    }

    const bodyHtml = article.body?.trim()
      ? formatBodyAsHtml(article.body)
      : article.summary?.trim()
        ? formatBodyAsHtml(article.summary)
        : "<p>Текст статьи пока не заполнен.</p>";

    const external =
      article.url?.trim() && /^https?:\/\//i.test(article.url.trim())
        ? `<p><a href="${escapeHtml(article.url.trim())}" rel="noopener noreferrer">Открыть доп. материал</a></p>`
        : "";

    const categoryBadge = article.category
      ? `<span class="badge">${escapeHtml(article.category)}</span>`
      : `<span class="badge">Инструкция</span>`;

    const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(article.title)} · Инструкция</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: linear-gradient(165deg, #eef4ff 0%, #f8fafc 42%, #f1f5f9 100%);
      color: #0f172a;
      min-height: 100vh;
    }
    .wrap { max-width: 720px; margin: 0 auto; padding: 28px 18px 48px; }
    .card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 28px 26px;
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
      letter-spacing: 0.02em;
    }
    h1 { margin: 14px 0 10px; font-size: clamp(22px, 4vw, 30px); line-height: 1.25; letter-spacing: -0.02em; }
    .summary { color: #475569; margin: 0 0 20px; font-size: 15px; }
    .content { line-height: 1.7; font-size: 16.5px; }
    .content p { margin: 0 0 14px; }
    a { color: #0e7490; }
    .foot { margin-top: 26px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <article class="card">
      ${categoryBadge}
      <h1>${escapeHtml(article.title)}</h1>
      ${article.summary ? `<p class="summary">${escapeHtml(article.summary)}</p>` : ""}
      <div class="content">${bodyHtml}</div>
      ${external}
      <div class="foot">Инструкция из Light CRM</div>
    </article>
  </div>
</body>
</html>`;

    res.type("html").send(html);
  });

  return router;
}
