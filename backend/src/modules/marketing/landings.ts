import { query } from "../../db";
import { getRealtimeServer } from "../../realtime";
import { slugifyKnowledgeTitle } from "../knowledge/slug";
import { sendWorkspaceTelegramAlert } from "../ops/alerts";

export type LandingStatus = "draft" | "published";

export type LandingUtm = {
  source: string;
  medium: string;
  campaign: string;
  content: string;
};

export type MarketingLandingPage = {
  id: string;
  workspace_id: string;
  slug: string;
  title: string;
  brand_name: string;
  headline: string;
  subheadline: string;
  body: string;
  cta_label: string;
  cta_url: string | null;
  phone: string | null;
  hero_image_url: string | null;
  cta_prefill: string;
  status: LandingStatus;
  view_count: number;
  click_count: number;
  leads_count: number;
  conversations_count: number;
  public_url: string;
  created_at: string;
  updated_at: string;
};

export type LandingInput = {
  title: string;
  brandName?: string;
  headline?: string;
  subheadline?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string | null;
  phone?: string | null;
  heroImageUrl?: string | null;
  ctaPrefill?: string;
  status?: LandingStatus;
  slug?: string;
};

const LANDING_SELECT = `id, workspace_id, slug, title, brand_name, headline, subheadline, body,
            cta_label, cta_url, phone, hero_image_url, cta_prefill, status, view_count, click_count,
            created_at::text, updated_at::text`;

function landingPublicBaseUrl(): string {
  return (
    process.env.LANDING_PUBLIC_BASE_URL ||
    process.env.KNOWLEDGE_PUBLIC_BASE_URL ||
    process.env.FRONTEND_PUBLIC_URL ||
    "https://light-crm-kz.netlify.app"
  ).replace(/\/$/, "");
}

export function buildLandingPublicUrl(slug: string): string {
  return `${landingPublicBaseUrl()}/l/${encodeURIComponent(slug)}`;
}

function normalizePhone(raw: string | null | undefined): string | null {
  let digits = String(raw || "").replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  }
  return digits;
}

function normalizeHttpUrl(raw: string | null | undefined): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^wa\.me\//i.test(value) || /^t\.me\//i.test(value)) return `https://${value}`;
  return null;
}

function resolveCtaUrl(ctaUrl: string | null | undefined, phone: string | null | undefined): string | null {
  const fromUrl = normalizeHttpUrl(ctaUrl);
  if (fromUrl) return fromUrl;
  const digits = normalizePhone(phone);
  if (digits) return `https://wa.me/${digits}`;
  return null;
}

function sanitizeUtmPart(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .slice(0, 80)
    .replace(/[|#\s]+/g, "-")
    .replace(/[^\w.-]/g, "");
}

export function readUtmFromQuery(queryParams: Record<string, unknown>): LandingUtm {
  return {
    source: sanitizeUtmPart(String(queryParams.utm_source || "")),
    medium: sanitizeUtmPart(String(queryParams.utm_medium || "")),
    campaign: sanitizeUtmPart(String(queryParams.utm_campaign || "")),
    content: sanitizeUtmPart(String(queryParams.utm_content || ""))
  };
}

export function buildLandingAttributionTag(slug: string, utm: LandingUtm): string {
  return [
    `#lc:${sanitizeUtmPart(slug) || "landing"}`,
    utm.source ? `s:${utm.source}` : "",
    utm.medium ? `m:${utm.medium}` : "",
    utm.campaign ? `c:${utm.campaign}` : "",
    utm.content ? `n:${utm.content}` : ""
  ]
    .filter(Boolean)
    .join("|");
}

export function parseLandingAttributionFromBody(body: string): {
  slug: string;
  utm: LandingUtm;
  cleanedBody: string;
} | null {
  const match = String(body || "").match(/#lc:([^\s|]+)((?:\|[smcn]:[^\s|]+)*)/);
  if (!match) return null;
  const slug = sanitizeUtmPart(match[1]);
  if (!slug) return null;
  const utm: LandingUtm = { source: "", medium: "", campaign: "", content: "" };
  const parts = String(match[2] || "").split("|").filter(Boolean);
  for (const part of parts) {
    const [key, ...rest] = part.split(":");
    const value = sanitizeUtmPart(rest.join(":"));
    if (key === "s") utm.source = value;
    if (key === "m") utm.medium = value;
    if (key === "c") utm.campaign = value;
    if (key === "n") utm.content = value;
  }
  const cleanedBody = String(body || "")
    .replace(match[0], "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { slug, utm, cleanedBody };
}

export function defaultLandingPrefill(landing: Pick<MarketingLandingPage, "headline" | "brand_name">): string {
  const title = landing.headline || landing.brand_name || "ваш оффер";
  return `Здравствуйте! Пишу со страницы «${title}». Хочу узнать подробнее.`;
}

export function extractWhatsAppPhone(
  ctaUrl: string | null | undefined,
  phone: string | null | undefined
): string | null {
  const fromPhone = normalizePhone(phone);
  if (fromPhone) return fromPhone;
  const fromWaMe = String(ctaUrl || "").match(/wa\.me\/(\d+)/i);
  if (fromWaMe?.[1]) return normalizePhone(fromWaMe[1]);
  const fromApi = String(ctaUrl || "").match(/[?&]phone=(\d+)/i);
  return fromApi?.[1] ? normalizePhone(fromApi[1]) : null;
}

export function buildTrackedCtaPath(slug: string): string {
  return `/l/${encodeURIComponent(slug)}/go`;
}

async function uniqueSlug(_workspaceId: string, title: string, preferred?: string): Promise<string> {
  const base = slugifyKnowledgeTitle(preferred?.trim() || title).slice(0, 48) || "landing";
  for (let i = 0; i < 20; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const rows = await query<{ id: string }>(
      `SELECT id FROM marketing_landing_pages WHERE slug = $1 LIMIT 1`,
      [candidate]
    );
    if (!rows[0]) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-6)}`;
}

type LandingRow = Omit<MarketingLandingPage, "public_url"> & {
  leads_count?: number | string | null;
  conversations_count?: number | string | null;
};

function mapRow(row: LandingRow): MarketingLandingPage {
  return {
    ...row,
    cta_prefill: row.cta_prefill || "",
    click_count: Number(row.click_count || 0),
    view_count: Number(row.view_count || 0),
    leads_count: Number(row.leads_count || 0),
    conversations_count: Number(row.conversations_count || 0),
    public_url: buildLandingPublicUrl(row.slug)
  };
}

export async function listLandingPages(workspaceId: string): Promise<MarketingLandingPage[]> {
  const rows = await query<LandingRow>(
    `SELECT l.id, l.workspace_id, l.slug, l.title, l.brand_name, l.headline, l.subheadline, l.body,
            l.cta_label, l.cta_url, l.phone, l.hero_image_url, l.cta_prefill, l.status,
            l.view_count, l.click_count, l.created_at::text, l.updated_at::text,
            COALESCE(stats.leads_count, 0)::int AS leads_count,
            COALESCE(stats.conversations_count, 0)::int AS conversations_count
     FROM marketing_landing_pages l
     LEFT JOIN (
       SELECT c.landing_id,
              COUNT(DISTINCT c.id)::int AS leads_count,
              COUNT(DISTINCT conv.id)::int AS conversations_count
       FROM contacts c
       LEFT JOIN conversations conv
         ON conv.contact_id = c.id AND conv.workspace_id = c.workspace_id
       WHERE c.workspace_id = $1 AND c.landing_id IS NOT NULL
       GROUP BY c.landing_id
     ) stats ON stats.landing_id = l.id
     WHERE l.workspace_id = $1
     ORDER BY l.updated_at DESC, l.created_at DESC`,
    [workspaceId]
  );
  return rows.map(mapRow);
}

export async function getLandingPage(
  workspaceId: string,
  landingId: string
): Promise<MarketingLandingPage | null> {
  const rows = await query<Omit<MarketingLandingPage, "public_url">>(
    `SELECT ${LANDING_SELECT}
     FROM marketing_landing_pages
     WHERE id = $1 AND workspace_id = $2
     LIMIT 1`,
    [landingId, workspaceId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createLandingPage(
  workspaceId: string,
  userId: string | null,
  input: LandingInput
): Promise<MarketingLandingPage | { error: string }> {
  const title = String(input.title || "").trim();
  if (!title) return { error: "Укажите название лендинга" };

  const brandName = String(input.brandName || title).trim() || title;
  const headline = String(input.headline || title).trim() || title;
  const subheadline = String(input.subheadline || "").trim();
  const body = String(input.body || "").trim();
  const ctaLabel = String(input.ctaLabel || "Написать в WhatsApp").trim() || "Написать в WhatsApp";
  const phone = normalizePhone(input.phone);
  const ctaUrl = resolveCtaUrl(input.ctaUrl, phone);
  const heroImageUrl = normalizeHttpUrl(input.heroImageUrl);
  const ctaPrefill = String(input.ctaPrefill ?? "").trim().slice(0, 900);
  const status: LandingStatus = input.status === "published" ? "published" : "draft";
  const slug = await uniqueSlug(workspaceId, title, input.slug);

  const rows = await query<Omit<MarketingLandingPage, "public_url">>(
    `INSERT INTO marketing_landing_pages
       (workspace_id, slug, title, brand_name, headline, subheadline, body,
        cta_label, cta_url, phone, hero_image_url, cta_prefill, status, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING ${LANDING_SELECT}`,
    [
      workspaceId,
      slug,
      title,
      brandName,
      headline,
      subheadline,
      body,
      ctaLabel,
      ctaUrl,
      phone,
      heroImageUrl,
      ctaPrefill,
      status,
      userId
    ]
  );
  return mapRow(rows[0]);
}

export async function updateLandingPage(
  workspaceId: string,
  landingId: string,
  input: Partial<LandingInput>
): Promise<MarketingLandingPage | { error: string }> {
  const current = await getLandingPage(workspaceId, landingId);
  if (!current) return { error: "Лендинг не найден" };

  const title = input.title !== undefined ? String(input.title).trim() : current.title;
  if (!title) return { error: "Укажите название лендинга" };

  const brandName =
    input.brandName !== undefined
      ? String(input.brandName).trim() || title
      : current.brand_name;
  const headline =
    input.headline !== undefined
      ? String(input.headline).trim() || title
      : current.headline;
  const subheadline =
    input.subheadline !== undefined ? String(input.subheadline).trim() : current.subheadline;
  const body = input.body !== undefined ? String(input.body).trim() : current.body;
  const ctaLabel =
    input.ctaLabel !== undefined
      ? String(input.ctaLabel).trim() || "Написать в WhatsApp"
      : current.cta_label;
  const phone = input.phone !== undefined ? normalizePhone(input.phone) : current.phone;
  const ctaUrl =
    input.ctaUrl !== undefined || input.phone !== undefined
      ? resolveCtaUrl(input.ctaUrl !== undefined ? input.ctaUrl : current.cta_url, phone)
      : current.cta_url;
  const heroImageUrl =
    input.heroImageUrl !== undefined
      ? normalizeHttpUrl(input.heroImageUrl)
      : current.hero_image_url;
  const ctaPrefill =
    input.ctaPrefill !== undefined
      ? String(input.ctaPrefill || "").trim().slice(0, 900)
      : current.cta_prefill;
  const status: LandingStatus =
    input.status !== undefined
      ? input.status === "published"
        ? "published"
        : "draft"
      : current.status;

  let slug = current.slug;
  if (input.slug !== undefined && String(input.slug).trim()) {
    const desired = slugifyKnowledgeTitle(String(input.slug).trim()).slice(0, 48) || current.slug;
    const clash = await query<{ id: string }>(
      `SELECT id FROM marketing_landing_pages WHERE slug = $1 AND id <> $2 LIMIT 1`,
      [desired, landingId]
    );
    slug = clash[0] ? await uniqueSlug(workspaceId, title, desired) : desired;
  }

  const rows = await query<Omit<MarketingLandingPage, "public_url">>(
    `UPDATE marketing_landing_pages
     SET title = $3,
         brand_name = $4,
         headline = $5,
         subheadline = $6,
         body = $7,
         cta_label = $8,
         cta_url = $9,
         phone = $10,
         hero_image_url = $11,
         cta_prefill = $12,
         status = $13,
         slug = $14,
         updated_at = now()
     WHERE id = $1 AND workspace_id = $2
     RETURNING ${LANDING_SELECT}`,
    [
      landingId,
      workspaceId,
      title,
      brandName,
      headline,
      subheadline,
      body,
      ctaLabel,
      ctaUrl,
      phone,
      heroImageUrl,
      ctaPrefill,
      status,
      slug
    ]
  );
  return rows[0] ? mapRow(rows[0]) : { error: "Лендинг не найден" };
}

export async function deleteLandingPage(
  workspaceId: string,
  landingId: string
): Promise<{ ok: true } | { error: string }> {
  const rows = await query<{ id: string }>(
    `DELETE FROM marketing_landing_pages
     WHERE id = $1 AND workspace_id = $2
     RETURNING id`,
    [landingId, workspaceId]
  );
  if (!rows[0]) return { error: "Лендинг не найден" };
  return { ok: true };
}

/** Черновик-копия для A/B: тот же контент, новый slug, счётчики с нуля. */
export async function duplicateLandingPage(
  workspaceId: string,
  landingId: string,
  userId: string | null
): Promise<MarketingLandingPage | { error: string }> {
  const current = await getLandingPage(workspaceId, landingId);
  if (!current) return { error: "Лендинг не найден" };

  const baseTitle = current.title.replace(/\s*\(B\d*\)\s*$/i, "").trim() || current.title;
  const title = `${baseTitle} (B)`.slice(0, 120);
  const preferredSlug = `${current.slug.replace(/-b\d*$/i, "")}-b`.slice(0, 48);

  return createLandingPage(workspaceId, userId, {
    title,
    brandName: current.brand_name,
    headline: current.headline,
    subheadline: current.subheadline,
    body: current.body,
    ctaLabel: current.cta_label,
    ctaUrl: current.cta_url,
    phone: current.phone,
    heroImageUrl: current.hero_image_url,
    ctaPrefill: current.cta_prefill,
    status: "draft",
    slug: preferredSlug
  });
}

export async function getPublishedLandingBySlug(slug: string): Promise<MarketingLandingPage | null> {
  const rows = await query<Omit<MarketingLandingPage, "public_url">>(
    `SELECT ${LANDING_SELECT}
     FROM marketing_landing_pages
     WHERE slug = $1 AND status = 'published'
     LIMIT 1`,
    [slug]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function bumpLandingView(landingId: string): Promise<void> {
  await query(`UPDATE marketing_landing_pages SET view_count = view_count + 1 WHERE id = $1`, [
    landingId
  ]);
}

export async function recordLandingClick(input: {
  landing: MarketingLandingPage;
  utm: LandingUtm;
  userAgent?: string | null;
}): Promise<void> {
  await query(
    `UPDATE marketing_landing_pages
     SET click_count = click_count + 1, updated_at = updated_at
     WHERE id = $1`,
    [input.landing.id]
  );
  await query(
    `INSERT INTO marketing_landing_clicks
       (landing_id, workspace_id, utm_source, utm_medium, utm_campaign, utm_content, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.landing.id,
      input.landing.workspace_id,
      input.utm.source || null,
      input.utm.medium || null,
      input.utm.campaign || null,
      input.utm.content || null,
      (input.userAgent || "").slice(0, 300) || null
    ]
  );
}

export function buildLandingDestinationUrl(
  landing: MarketingLandingPage,
  utm: LandingUtm
): string | null {
  const waPhone = extractWhatsAppPhone(landing.cta_url, landing.phone);
  if (waPhone) {
    const prefill = (landing.cta_prefill || "").trim() || defaultLandingPrefill(landing);
    const tag = buildLandingAttributionTag(landing.slug, utm);
    const text = `${prefill}\n\n${tag}`.trim();
    return `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
  }

  const base = landing.cta_url;
  if (!base || !/^https?:\/\//i.test(base)) return null;

  try {
    const url = new URL(base);
    if (utm.source) url.searchParams.set("utm_source", utm.source);
    if (utm.medium) url.searchParams.set("utm_medium", utm.medium);
    if (utm.campaign) url.searchParams.set("utm_campaign", utm.campaign);
    if (utm.content) url.searchParams.set("utm_content", utm.content);
    return url.toString();
  } catch {
    return base;
  }
}

export type LandingAttributionResult = {
  applied: boolean;
  isFirstLandingLead: boolean;
  landingId: string;
  landingTitle: string;
  utm: LandingUtm;
};

export const LANDING_LEAD_TASK_PREFIX = "Лид с лендинга";

export async function applyLandingAttributionToContact(input: {
  workspaceId: string;
  contactId: string;
  slug: string;
  utm: LandingUtm;
}): Promise<LandingAttributionResult | null> {
  const before = await query<{ landing_id: string | null }>(
    `SELECT landing_id FROM contacts WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [input.contactId, input.workspaceId]
  );
  const hadLanding = Boolean(before[0]?.landing_id);

  let landingId = "";
  let landingTitle = input.slug;

  const published = await getPublishedLandingBySlug(input.slug);
  if (published && published.workspace_id === input.workspaceId) {
    landingId = published.id;
    landingTitle = published.headline || published.title || input.slug;
  } else {
    const rows = await query<{ id: string; headline: string; title: string }>(
      `SELECT id, headline, title FROM marketing_landing_pages
       WHERE workspace_id = $1 AND slug = $2 LIMIT 1`,
      [input.workspaceId, input.slug]
    );
    if (!rows[0]) return null;
    landingId = rows[0].id;
    landingTitle = rows[0].headline || rows[0].title || input.slug;
  }

  await query(
    `UPDATE contacts
     SET marketing_source = 'landing',
         utm_source = COALESCE(NULLIF($3, ''), utm_source),
         utm_medium = COALESCE(NULLIF($4, ''), utm_medium),
         utm_campaign = COALESCE(NULLIF($5, ''), utm_campaign),
         utm_content = COALESCE(NULLIF($6, ''), utm_content),
         landing_id = $7,
         inquiry_reason = COALESCE(NULLIF(inquiry_reason, ''), $8)
     WHERE id = $1 AND workspace_id = $2`,
    [
      input.contactId,
      input.workspaceId,
      input.utm.source,
      input.utm.medium,
      input.utm.campaign,
      input.utm.content,
      landingId,
      landingTitle
    ]
  );

  return {
    applied: true,
    isFirstLandingLead: !hadLanding,
    landingId,
    landingTitle,
    utm: input.utm
  };
}

/** Одна open-задача на диалог: ответить лиду с лендинга. */
export async function ensureLandingLeadFollowUpTask(input: {
  workspaceId: string;
  conversationId: string;
  ownerUserId?: string | null;
  landingTitle: string;
  utmCampaign?: string;
  contactName?: string | null;
  contactPhone?: string | null;
}): Promise<{ created: boolean; taskId?: string }> {
  const existing = await query<{ id: string }>(
    `SELECT id
     FROM tasks
     WHERE workspace_id = $1
       AND conversation_id = $2
       AND status = 'open'
       AND title LIKE $3
     LIMIT 1`,
    [input.workspaceId, input.conversationId, `${LANDING_LEAD_TASK_PREFIX}%`]
  );
  if (existing[0]) {
    return { created: false, taskId: existing[0].id };
  }

  const campaign = (input.utmCampaign || "").trim();
  const title = (
    campaign
      ? `${LANDING_LEAD_TASK_PREFIX}: ${input.landingTitle} · ${campaign}`
      : `${LANDING_LEAD_TASK_PREFIX}: ${input.landingTitle}`
  ).slice(0, 160);

  const deal = await query<{ id: string }>(
    `SELECT id FROM deals WHERE conversation_id = $1 AND workspace_id = $2 LIMIT 1`,
    [input.conversationId, input.workspaceId]
  );

  let ownerUserId = input.ownerUserId || null;
  if (!ownerUserId) {
    const conv = await query<{ assigned_manager_id: string | null }>(
      `SELECT assigned_manager_id FROM conversations WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [input.conversationId, input.workspaceId]
    );
    ownerUserId = conv[0]?.assigned_manager_id || null;
  }

  const inserted = await query<{ id: string }>(
    `INSERT INTO tasks (workspace_id, conversation_id, deal_id, owner_user_id, title, due_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '30 minutes')
     RETURNING id`,
    [input.workspaceId, input.conversationId, deal[0]?.id || null, ownerUserId, title]
  );

  await query(
    `UPDATE conversations
     SET priority = CASE
           WHEN priority IN ('low', 'normal') OR priority IS NULL THEN 'high'
           ELSE priority
         END,
         updated_at = now()
     WHERE id = $1 AND workspace_id = $2`,
    [input.conversationId, input.workspaceId]
  );

  if (!inserted[0]) {
    return { created: false };
  }

  const appBase = (
    process.env.FRONTEND_PUBLIC_URL ||
    process.env.LANDING_PUBLIC_BASE_URL ||
    "https://light-crm-kz.netlify.app"
  ).replace(/\/+$/, "");

  const alertLines = [
    "Новый лид с лендинга",
    title,
    input.contactName ? `Клиент: ${input.contactName}` : "",
    input.contactPhone ? `Тел: ${input.contactPhone}` : "",
    `Ответить за 30 мин · ${appBase}`
  ].filter(Boolean);

  void sendWorkspaceTelegramAlert(input.workspaceId, alertLines.join("\n")).catch((error) => {
    console.error("Landing lead Telegram alert failed", error);
  });

  getRealtimeServer()?.emit("task:new", {
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    taskId: inserted[0].id,
    title,
    kind: "landing_lead",
    dueInMinutes: 30
  });

  return { created: true, taskId: inserted[0].id };
}
