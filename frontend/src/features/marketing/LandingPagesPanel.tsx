import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SOCKET_BASE_URL } from "../../shared/config/api";
import {
  createMarketingLanding,
  deleteMarketingLanding,
  duplicateMarketingLanding,
  generateMarketingLanding,
  loadMarketingAiStatus,
  loadMarketingLandings,
  updateMarketingLanding,
  uploadMarketingLandingImage,
  type MarketingLandingPage
} from "./api";
import { LANDING_TEMPLATES, type LandingTemplate } from "./landingTemplates";
import { withLandingAdsUtm } from "./landingUtm";

type Props = {
  authToken: string;
  onToast?: (message: string, kind: "success" | "error") => void;
  onUseInAds?: (publicUrl: string, meta?: { title?: string; slug?: string }) => void;
};

const emptyForm = {
  title: "",
  brandName: "",
  headline: "",
  subheadline: "",
  body: "",
  ctaLabel: "Написать в WhatsApp",
  ctaUrl: "",
  phone: "",
  heroImageUrl: "",
  ctaPrefill: "",
  slug: ""
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBodyAsHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function resolveMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return `${SOCKET_BASE_URL}${trimmed}`;
  return trimmed;
}

function buildPreviewHtml(form: typeof emptyForm): string {
  const brand = form.brandName.trim() || form.title.trim() || "Бренд";
  const headline = form.headline.trim() || form.title.trim() || "Заголовок";
  const subheadline = form.subheadline.trim();
  const ctaLabel = form.ctaLabel.trim() || "Связаться";
  const phoneDigits = form.phone.replace(/\D/g, "");
  const prefill =
    form.ctaPrefill.trim() ||
    (form.headline.trim() || form.title.trim()
      ? `Здравствуйте! Пишу со страницы «${form.headline.trim() || form.title.trim()}». Хочу узнать подробнее.`
      : "Здравствуйте! Хочу узнать подробнее.");
  let ctaHref = "";
  if (phoneDigits) {
    ctaHref = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(prefill)}`;
  } else if (form.ctaUrl.trim() && /^https?:\/\//i.test(form.ctaUrl.trim())) {
    ctaHref = form.ctaUrl.trim();
  }
  const cta = ctaHref
    ? `<a class="cta" href="${escapeHtml(ctaHref)}" rel="noopener noreferrer">${escapeHtml(ctaLabel)}</a>`
    : "";
  const heroUrl = resolveMediaUrl(form.heroImageUrl);
  const heroImage = heroUrl
    ? `<div class="heroMedia" style="background-image:url('${escapeHtml(heroUrl)}')" role="img" aria-label=""></div>`
    : `<div class="heroMedia heroFallback" aria-hidden="true"></div>`;
  const bodyHtml = form.body.trim() ? formatBodyAsHtml(form.body) : "";

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(headline)} · ${escapeHtml(brand)}</title>
  <style>
    :root {
      --ink: #14212b;
      --muted: #5b6b7c;
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
      box-shadow: 0 10px 28px rgba(0,0,0,0.18);
    }
    .section {
      width: min(760px, calc(100% - 32px));
      margin: 0 auto;
      padding: 36px 0 64px;
    }
    .content { font-size: 17px; line-height: 1.7; color: var(--ink); }
    .content p { margin: 0 0 14px; }
    .foot {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <header class="hero">
    ${heroImage}
    <div class="heroInner">
      <h1 class="brand">${escapeHtml(brand)}</h1>
      <p class="headline">${escapeHtml(headline)}</p>
      ${subheadline ? `<p class="sub">${escapeHtml(subheadline)}</p>` : ""}
      ${cta ? `<div class="ctaGroup">${cta}</div>` : ""}
    </div>
  </header>
  ${
    bodyHtml
      ? `<main class="section"><div class="content">${bodyHtml}</div><div class="foot">${escapeHtml(
          brand
        )}</div></main>`
      : ""
  }
</body>
</html>`;
}

export function LandingPagesPanel({ authToken, onToast, onUseInAds }: Props) {
  const [items, setItems] = useState<MarketingLandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiOffer, setAiOffer] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const toast = useCallback(
    (message: string, kind: "success" | "error") => {
      onToast?.(message, kind);
    },
    [onToast]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    const rows = await loadMarketingLandings(authToken);
    setItems(rows);
    setLoading(false);
  }, [authToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void (async () => {
      const status = await loadMarketingAiStatus(authToken);
      setAiConfigured(Boolean(status?.configured));
    })();
  }, [authToken]);

  const previewHtml = useMemo(() => buildPreviewHtml(form), [form]);

  const funnel = useMemo(() => {
    const views = items.reduce((sum, item) => sum + (item.view_count || 0), 0);
    const clicks = items.reduce((sum, item) => sum + (item.click_count || 0), 0);
    const leads = items.reduce((sum, item) => sum + (item.leads_count || 0), 0);
    const dialogs = items.reduce((sum, item) => sum + (item.conversations_count || 0), 0);
    const ctr = views > 0 ? Math.round((clicks / views) * 1000) / 10 : 0;
    const cr = clicks > 0 ? Math.round((dialogs / clicks) * 1000) / 10 : 0;
    return { views, clicks, leads, dialogs, ctr, cr };
  }, [items]);

  function formatRate(part: number, whole: number): string {
    if (!whole) return "—";
    return `${Math.round((part / whole) * 1000) / 10}%`;
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function startEdit(item: MarketingLandingPage) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      brandName: item.brand_name,
      headline: item.headline,
      subheadline: item.subheadline,
      body: item.body,
      ctaLabel: item.cta_label,
      ctaUrl: item.cta_url || "",
      phone: item.phone || "",
      heroImageUrl: item.hero_image_url || "",
      ctaPrefill: item.cta_prefill || "",
      slug: item.slug
    });
  }

  async function save(status?: "draft" | "published") {
    if (!form.title.trim()) {
      toast("Укажите название лендинга", "error");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      brandName: form.brandName.trim() || form.title.trim(),
      headline: form.headline.trim() || form.title.trim(),
      subheadline: form.subheadline.trim(),
      body: form.body.trim(),
      ctaLabel: form.ctaLabel.trim() || "Написать в WhatsApp",
      ctaUrl: form.ctaUrl.trim() || null,
      phone: form.phone.trim() || null,
      heroImageUrl: form.heroImageUrl.trim() || null,
      ctaPrefill: form.ctaPrefill.trim(),
      slug: form.slug.trim() || undefined,
      status
    };

    const result = editingId
      ? await updateMarketingLanding(authToken, editingId, payload)
      : await createMarketingLanding(authToken, payload);

    setSaving(false);
    if (!result) {
      toast("Не удалось сохранить лендинг", "error");
      return;
    }
    toast(status === "published" ? "Лендинг опубликован" : "Лендинг сохранён", "success");
    setEditingId(result.id);
    setForm((prev) => ({ ...prev, slug: result.slug }));
    await reload();
  }

  async function remove(item: MarketingLandingPage) {
    if (!window.confirm(`Удалить лендинг «${item.title}»?`)) return;
    const ok = await deleteMarketingLanding(authToken, item.id);
    if (!ok) {
      toast("Не удалось удалить", "error");
      return;
    }
    if (editingId === item.id) startCreate();
    toast("Лендинг удалён", "success");
    await reload();
  }

  async function duplicate(item: MarketingLandingPage) {
    setSaving(true);
    const copy = await duplicateMarketingLanding(authToken, item.id);
    setSaving(false);
    if (!copy) {
      toast("Не удалось дублировать", "error");
      return;
    }
    toast("Копия создана как черновик — меняйте оффер и публикуйте", "success");
    startEdit(copy);
    await reload();
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("Ссылка скопирована", "success");
    } catch {
      toast(url, "success");
    }
  }

  async function onHeroFileSelected(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Нужно изображение (jpeg/png/webp/gif)", "error");
      return;
    }
    setUploading(true);
    const uploaded = await uploadMarketingLandingImage(authToken, file);
    setUploading(false);
    if (!uploaded?.imageUrl) {
      toast("Не удалось загрузить изображение", "error");
      return;
    }
    setForm((prev) => ({ ...prev, heroImageUrl: uploaded.imageUrl }));
    toast("Изображение загружено", "success");
  }

  function useInAds(item: MarketingLandingPage) {
    const tracked = withLandingAdsUtm(item.public_url, {
      slug: item.slug,
      campaign: item.title || item.slug
    });
    if (!onUseInAds) {
      void copyUrl(tracked);
      return;
    }
    onUseInAds(tracked, { title: item.title, slug: item.slug });
  }

  function applyTemplate(template: LandingTemplate) {
    const brand = form.brandName.trim();
    setForm((prev) => ({
      ...prev,
      title: template.form.title,
      brandName: brand || template.form.brandName,
      headline: template.form.headline,
      subheadline: template.form.subheadline,
      body: template.form.body,
      ctaLabel: template.form.ctaLabel,
      ctaPrefill: template.form.ctaPrefill
      // phone / hero / slug не трогаем
    }));
    setAiTopic(template.aiTopic);
    toast(`Шаблон «${template.label}» подставлен — правьте бренд и телефон`, "success");
  }

  async function generateDraft() {
    const topic = aiTopic.trim() || form.title.trim() || form.headline.trim();
    if (!topic) {
      toast("Укажите тему бизнеса или услуги", "error");
      return;
    }
    if (!aiConfigured) {
      toast("AI не настроен на сервере", "error");
      return;
    }
    setGenerating(true);
    const draft = await generateMarketingLanding(authToken, {
      topic,
      brandName: form.brandName.trim() || undefined,
      offer: aiOffer.trim() || undefined
    });
    setGenerating(false);
    if (!draft) {
      toast("Не удалось сгенерировать черновик", "error");
      return;
    }
    setForm((prev) => ({
      ...prev,
      title: draft.title || prev.title,
      brandName: draft.brandName || prev.brandName,
      headline: draft.headline || prev.headline,
      subheadline: draft.subheadline || prev.subheadline,
      body: draft.body || prev.body,
      ctaLabel: draft.ctaLabel || prev.ctaLabel,
      ctaPrefill: draft.ctaPrefill || prev.ctaPrefill
    }));
    toast("Черновик лендинга готов — проверьте и сохраните", "success");
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
        <div className="scriptPanelTitle">
          {editingId ? "Редактирование лендинга" : "Новый лендинг для бизнеса"}
        </div>
        <div className="sidebarHint" style={{ marginBottom: 12 }}>
          Публичная страница для рекламы и рассылок. После публикации ссылку можно вставить в Meta Ads
          или WhatsApp.
        </div>
        <div style={{ marginBottom: 14 }}>
          <div className="sidebarHint" style={{ marginBottom: 8 }}>
            Шаблоны ниш — один клик, затем свой бренд и телефон
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {LANDING_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className="leftMenuButton"
                title={template.hint}
                onClick={() => applyTemplate(template)}
              >
                {template.label}
              </button>
            ))}
          </div>
        </div>
        <div className="scriptForm" style={{ marginBottom: 14 }}>
          <div className="sidebarHint" style={{ marginBottom: 6 }}>
            AI-черновик{aiConfigured ? "" : " · AI не подключен"} — можно после шаблона уточнить оффер
          </div>
          <input
            className="filterInput"
            placeholder="Тема: кто вы и что продаёте (напр. стоматология в Алматы)"
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
          />
          <input
            className="filterInput"
            placeholder="Оффер (необязательно): скидка 20%, запись за 5 минут…"
            value={aiOffer}
            onChange={(e) => setAiOffer(e.target.value)}
          />
          <button
            type="button"
            className="primaryButton"
            disabled={generating || !aiConfigured}
            onClick={() => void generateDraft()}
          >
            {generating ? "Генерирую…" : "Сгенерировать черновик"}
          </button>
        </div>
        <div className="scriptForm">
          <input
            className="filterInput"
            placeholder="Название (внутреннее)"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          />
          <input
            className="filterInput"
            placeholder="Бренд на странице"
            value={form.brandName}
            onChange={(e) => setForm((p) => ({ ...p, brandName: e.target.value }))}
          />
          <input
            className="filterInput"
            placeholder="Заголовок"
            value={form.headline}
            onChange={(e) => setForm((p) => ({ ...p, headline: e.target.value }))}
          />
          <input
            className="filterInput"
            placeholder="Короткое описание под заголовком"
            value={form.subheadline}
            onChange={(e) => setForm((p) => ({ ...p, subheadline: e.target.value }))}
          />
          <textarea
            className="filterInput"
            placeholder="Текст ниже (абзацы через пустую строку)"
            rows={5}
            value={form.body}
            onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
          />
          <input
            className="filterInput"
            placeholder="Текст кнопки (CTA)"
            value={form.ctaLabel}
            onChange={(e) => setForm((p) => ({ ...p, ctaLabel: e.target.value }))}
          />
          <input
            className="filterInput"
            placeholder="Телефон для WhatsApp (например 77003131055)"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          />
          <input
            className="filterInput"
            placeholder="Или прямой URL кнопки (https://...)"
            value={form.ctaUrl}
            onChange={(e) => setForm((p) => ({ ...p, ctaUrl: e.target.value }))}
          />
          <textarea
            className="filterInput"
            placeholder="Текст сообщения в WhatsApp (prefill). Пусто = авто из заголовка"
            rows={3}
            value={form.ctaPrefill}
            onChange={(e) => setForm((p) => ({ ...p, ctaPrefill: e.target.value }))}
          />
          <div className="sidebarHint">
            UTM из ссылки рекламы (`?utm_source=meta&utm_campaign=…`) сохраняются в кликах и
            проставляются в контакт CRM, когда клиент пишет в WhatsApp с prefill.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <input
              className="filterInput"
              placeholder="URL фонового изображения (или загрузите файл)"
              value={form.heroImageUrl}
              onChange={(e) => setForm((p) => ({ ...p, heroImageUrl: e.target.value }))}
            />
            <div className="sidebarHint">
              Эта картинка уходит в превью WhatsApp / Meta (OG). Лучше широкий JPG/PNG без мелкого текста.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  e.target.value = "";
                  void onHeroFileSelected(file);
                }}
              />
              <button
                type="button"
                className="leftMenuButton"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "Загрузка…" : "Загрузить картинку"}
              </button>
              {form.heroImageUrl ? (
                <span className="sidebarHint" style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {form.heroImageUrl}
                </span>
              ) : null}
            </div>
          </div>
          <input
            className="filterInput"
            placeholder="Slug в ссылке (необязательно)"
            value={form.slug}
            onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="leftMenuButton"
              onClick={() => setPreviewOpen(true)}
            >
              Превью
            </button>
            <button
              type="button"
              className="primaryButton"
              disabled={saving}
              onClick={() => void save("draft")}
            >
              Сохранить черновик
            </button>
            <button
              type="button"
              className="primaryButton"
              disabled={saving}
              onClick={() => void save("published")}
            >
              Опубликовать
            </button>
            {editingId ? (
              <button type="button" className="leftMenuButton" onClick={startCreate}>
                Новый
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
        <div className="scriptPanelTitle">Воронка лендингов</div>
        <div className="sidebarHint" style={{ marginBottom: 10 }}>
          Просмотры → клики CTA → диалоги в CRM (по контактам с атрибуцией лендинга)
        </div>
        {loading ? (
          <div className="sidebarHint">Загрузка…</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 12
            }}
          >
            <div>
              <div style={{ fontWeight: 750, fontSize: 22 }}>{funnel.views}</div>
              <div className="sidebarHint">просмотры</div>
            </div>
            <div>
              <div style={{ fontWeight: 750, fontSize: 22 }}>{funnel.clicks}</div>
              <div className="sidebarHint">клики · CTR {funnel.ctr}%</div>
            </div>
            <div>
              <div style={{ fontWeight: 750, fontSize: 22 }}>{funnel.leads}</div>
              <div className="sidebarHint">контакты</div>
            </div>
            <div>
              <div style={{ fontWeight: 750, fontSize: 22 }}>{funnel.dialogs}</div>
              <div className="sidebarHint">диалоги · CR {funnel.cr}%</div>
            </div>
          </div>
        )}
      </div>

      <div className="knowledgeFormCard">
        <div className="scriptPanelTitle">Ваши лендинги</div>
        {loading ? <div className="sidebarHint">Загрузка…</div> : null}
        {!loading && items.length === 0 ? (
          <div className="sidebarHint">Пока нет лендингов — создайте первый выше.</div>
        ) : null}
        <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                borderTop: "1px solid rgba(15,23,42,0.08)",
                paddingTop: 12,
                display: "grid",
                gap: 6
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {item.title}{" "}
                <span className="sidebarHint">
                  · {item.status === "published" ? "опубликован" : "черновик"}
                </span>
              </div>
              <div className="sidebarHint">
                {item.view_count || 0} просм. → {item.click_count || 0} кликов (
                {formatRate(item.click_count || 0, item.view_count || 0)}) →{" "}
                {item.conversations_count || 0} диалогов (
                {formatRate(item.conversations_count || 0, item.click_count || 0)}) ·{" "}
                {item.leads_count || 0} контактов
              </div>
              <div className="sidebarHint">{item.headline}</div>
              {item.status === "published" ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <a href={item.public_url} target="_blank" rel="noreferrer">
                    {item.public_url}
                  </a>
                  <button
                    type="button"
                    className="leftMenuButton"
                    onClick={() => void copyUrl(item.public_url)}
                  >
                    Копировать ссылку
                  </button>
                  <button
                    type="button"
                    className="leftMenuButton"
                    onClick={() => useInAds(item)}
                  >
                    Вставить в Ads
                  </button>
                </div>
              ) : (
                <div className="sidebarHint">Опубликуйте, чтобы получить публичную ссылку /l/…</div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" className="leftMenuButton" onClick={() => startEdit(item)}>
                  Редактировать
                </button>
                <button
                  type="button"
                  className="leftMenuButton"
                  disabled={saving}
                  title="Копия для A/B: тот же лендинг, другой slug/оффер"
                  onClick={() => void duplicate(item)}
                >
                  Дублировать (A/B)
                </button>
                <button
                  type="button"
                  className="leftMenuButton"
                  onClick={() => {
                    startEdit(item);
                    setPreviewOpen(true);
                  }}
                >
                  Превью
                </button>
                {item.status === "draft" ? (
                  <button
                    type="button"
                    className="leftMenuButton"
                    onClick={() => {
                      startEdit(item);
                      void (async () => {
                        setSaving(true);
                        const result = await updateMarketingLanding(authToken, item.id, {
                          status: "published"
                        });
                        setSaving(false);
                        if (!result) {
                          toast("Не удалось опубликовать", "error");
                          return;
                        }
                        toast("Лендинг опубликован", "success");
                        await reload();
                      })();
                    }}
                  >
                    Опубликовать
                  </button>
                ) : (
                  <button
                    type="button"
                    className="leftMenuButton"
                    onClick={() => {
                      void (async () => {
                        const result = await updateMarketingLanding(authToken, item.id, {
                          status: "draft"
                        });
                        if (!result) {
                          toast("Не удалось снять с публикации", "error");
                          return;
                        }
                        toast("Снято с публикации", "success");
                        await reload();
                      })();
                    }}
                  >
                    В черновик
                  </button>
                )}
                <button type="button" className="leftMenuButton" onClick={() => void remove(item)}>
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {previewOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Превью лендинга"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "rgba(10,16,20,0.55)",
            display: "grid",
            placeItems: "center",
            padding: 16
          }}
          onClick={() => setPreviewOpen(false)}
        >
          <div
            style={{
              width: "min(960px, 100%)",
              height: "min(86vh, 900px)",
              background: "#fff",
              borderRadius: 16,
              overflow: "hidden",
              display: "grid",
              gridTemplateRows: "auto 1fr",
              boxShadow: "0 24px 64px rgba(0,0,0,0.28)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid rgba(15,23,42,0.08)"
              }}
            >
              <div className="scriptPanelTitle" style={{ margin: 0 }}>
                Превью лендинга
              </div>
              <button type="button" className="leftMenuButton" onClick={() => setPreviewOpen(false)}>
                Закрыть
              </button>
            </div>
            <iframe
              title="Превью лендинга"
              srcDoc={previewHtml}
              style={{ width: "100%", height: "100%", border: 0, background: "#f7f4ee" }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
