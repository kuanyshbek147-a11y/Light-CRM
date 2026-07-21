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

function publicBaseUrl(): string {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.FRONTEND_PUBLIC_URL ||
    "https://light-crm-backend.onrender.com"
  ).replace(/\/$/, "");
}

export function buildKnowledgeShareUrl(publicSlug: string): string {
  return `${publicBaseUrl()}/kb/${encodeURIComponent(publicSlug)}`;
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

    const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(article.title)} · Light CRM</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f4f6fb; color: #0f172a; }
    .wrap { max-width: 720px; margin: 0 auto; padding: 28px 18px 48px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 24px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06); }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #eef2ff; color: #4338ca; font-size: 12px; font-weight: 700; }
    h1 { margin: 12px 0 8px; font-size: 28px; line-height: 1.2; }
    .summary { color: #475569; margin: 0 0 18px; }
    .content { line-height: 1.65; font-size: 16px; }
    .content p { margin: 0 0 14px; }
    a { color: #4f46e5; }
    .foot { margin-top: 22px; color: #94a3b8; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <article class="card">
      ${article.category ? `<span class="badge">${escapeHtml(article.category)}</span>` : ""}
      <h1>${escapeHtml(article.title)}</h1>
      ${article.summary ? `<p class="summary">${escapeHtml(article.summary)}</p>` : ""}
      <div class="content">${bodyHtml}</div>
      ${external}
      <div class="foot">Light CRM · база знаний</div>
    </article>
  </div>
</body>
</html>`;

    res.type("html").send(html);
  });

  return router;
}
