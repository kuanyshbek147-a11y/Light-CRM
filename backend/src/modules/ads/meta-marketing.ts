import { createHash } from "crypto";
import type { MetaAdsCredentials } from "./credentials";

type GraphError = {
  error?: { message?: string; type?: string; code?: number; error_user_msg?: string };
};

function apiVersion(): string {
  return process.env.META_ADS_API_VERSION || process.env.WHATSAPP_API_VERSION || "v21.0";
}

function graphUrl(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `https://graph.facebook.com/${apiVersion()}${clean}`;
}

async function graphRequest<T>(
  credentials: MetaAdsCredentials,
  path: string,
  init?: { method?: string; body?: Record<string, unknown> | FormData; form?: boolean }
): Promise<T> {
  const method = init?.method || "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${credentials.accessToken}`
  };
  let body: string | FormData | undefined;
  if (init?.body && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  } else if (init?.body instanceof FormData) {
    body = init.body;
  }

  const response = await fetch(graphUrl(path), { method, headers, body });
  const payload = (await response.json()) as T & GraphError;
  if (!response.ok || payload.error) {
    const message =
      payload.error?.error_user_msg ||
      payload.error?.message ||
      JSON.stringify(payload.error || payload);
    throw new Error(`Meta Ads API ${response.status}: ${message}`);
  }
  return payload;
}

/** Normalize phone to digits-only E.164-ish then SHA-256 hex (Meta Custom Audience). */
export function hashPhoneForMeta(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  // Kazakhstan local 8XXXXXXXXXX → 7XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  }
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }
  return createHash("sha256").update(digits).digest("hex");
}

export async function createCustomAudience(
  credentials: MetaAdsCredentials,
  name: string,
  description: string
): Promise<string> {
  const payload = await graphRequest<{ id?: string }>(
    credentials,
    `/${credentials.adAccountId}/customaudiences`,
    {
      method: "POST",
      body: {
        name: name.slice(0, 100),
        subtype: "CUSTOM",
        description: description.slice(0, 200),
        customer_file_source: "USER_PROVIDED_ONLY"
      }
    }
  );
  if (!payload.id) {
    throw new Error("Meta audience id missing");
  }
  return payload.id;
}

export async function uploadAudiencePhones(
  credentials: MetaAdsCredentials,
  audienceId: string,
  phones: string[]
): Promise<{ received: number }> {
  const hashes = phones
    .map(hashPhoneForMeta)
    .filter((value): value is string => Boolean(value));
  if (!hashes.length) {
    return { received: 0 };
  }

  const batchSize = 5000;
  let received = 0;
  for (let i = 0; i < hashes.length; i += batchSize) {
    const chunk = hashes.slice(i, i + batchSize);
    const payload = await graphRequest<{ num_received?: number }>(
      credentials,
      `/${audienceId}/users`,
      {
        method: "POST",
        body: {
          payload: {
            schema: ["PHONE_SHA256"],
            data: chunk.map((hash) => [hash])
          }
        }
      }
    );
    received += Number(payload.num_received || chunk.length);
  }
  return { received };
}

export async function getAudienceApproxSize(
  credentials: MetaAdsCredentials,
  audienceId: string
): Promise<number> {
  const payload = await graphRequest<{ approximate_count?: number; approximate_count_lower_bound?: number }>(
    credentials,
    `/${audienceId}?fields=approximate_count,approximate_count_lower_bound`
  );
  return Number(
    payload.approximate_count ?? payload.approximate_count_lower_bound ?? 0
  );
}

/** MSMB / CRM interests for KZ traffic (Meta interest IDs). */
export const DEFAULT_TRAFFIC_INTERESTS = [
  { id: "6003206992086" }, // CRM systems
  { id: "6003371567474" }, // Entrepreneurship
  { id: "6003755775353" }, // Small business software
  { id: "6003584283289" }, // WhatsApp
  { id: "6002884511422" }, // Small business
  { id: "6003670602220" } // Instagram
] as const;

/** Tiny custom audiences alone block delivery — only attach above this size. */
export function minCustomAudienceSize(): number {
  const raw = Number(process.env.ADS_MIN_CUSTOM_AUDIENCE_SIZE || 100);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100;
}

export function buildTrafficTargeting(input: {
  audienceId?: string | null;
  audienceSize?: number;
  country?: string;
  ageMin?: number;
  ageMax?: number;
}): Record<string, unknown> {
  const country = (input.country || process.env.ADS_DEFAULT_COUNTRY || "KZ").trim().toUpperCase() || "KZ";
  const ageMin = Math.min(65, Math.max(13, Math.floor(input.ageMin ?? 25)));
  const ageMax = Math.min(65, Math.max(ageMin, Math.floor(input.ageMax ?? 55)));

  const targeting: Record<string, unknown> = {
    geo_locations: { countries: [country] },
    age_min: ageMin,
    age_max: ageMax,
    flexible_spec: [{ interests: DEFAULT_TRAFFIC_INTERESTS.map((item) => ({ id: item.id })) }],
    publisher_platforms: ["facebook", "instagram"],
    // Keep 0: Advantage+ forbids age_max < 65
    targeting_automation: { advantage_audience: 0 }
  };

  const audienceId = (input.audienceId || "").trim();
  const audienceSize = Number(input.audienceSize || 0);
  if (audienceId && audienceSize >= minCustomAudienceSize()) {
    targeting.custom_audiences = [{ id: audienceId }];
  }

  return targeting;
}

export async function createTrafficCampaign(
  credentials: MetaAdsCredentials,
  input: {
    name: string;
    audienceId?: string | null;
    audienceSize?: number;
    country?: string;
    pageId: string;
    dailyBudgetCents: number;
    message: string;
    linkUrl: string;
    imageUrl?: string | null;
    status?: "PAUSED" | "ACTIVE";
  }
): Promise<{ campaignId: string; adsetId: string; creativeId: string; adId: string }> {
  const pageId = input.pageId.trim();
  if (!pageId) {
    throw new Error("Meta Ads page_id required");
  }
  const status = input.status || "PAUSED";
  const dailyBudget = Math.max(100, Math.floor(input.dailyBudgetCents)); // Meta expects cents for USD accounts

  const campaign = await graphRequest<{ id?: string }>(
    credentials,
    `/${credentials.adAccountId}/campaigns`,
    {
      method: "POST",
      body: {
        name: input.name.slice(0, 120),
        objective: "OUTCOME_TRAFFIC",
        status: "PAUSED",
        special_ad_categories: [],
        // Required when budget is set on ad sets (not CBO)
        is_adset_budget_sharing_enabled: false
      }
    }
  );
  if (!campaign.id) throw new Error("campaign id missing");

  const targeting = buildTrafficTargeting({
    audienceId: input.audienceId,
    audienceSize: input.audienceSize,
    country: input.country
  });

  const adset = await graphRequest<{ id?: string }>(
    credentials,
    `/${credentials.adAccountId}/adsets`,
    {
      method: "POST",
      body: {
        name: `${input.name.slice(0, 80)} AdSet`,
        campaign_id: campaign.id,
        daily_budget: dailyBudget,
        billing_event: "IMPRESSIONS",
        optimization_goal: "LINK_CLICKS",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        status: "PAUSED",
        targeting,
        promoted_object: { page_id: pageId }
      }
    }
  );
  if (!adset.id) throw new Error("adset id missing");

  const objectStorySpec: Record<string, unknown> = {
    page_id: pageId,
    link_data: {
      message: input.message.slice(0, 2000),
      link: input.linkUrl,
      name: input.name.slice(0, 100),
      call_to_action: { type: "LEARN_MORE", value: { link: input.linkUrl } }
    }
  };
  if (input.imageUrl) {
    (objectStorySpec.link_data as Record<string, unknown>).picture = input.imageUrl;
  }

  const creative = await graphRequest<{ id?: string }>(
    credentials,
    `/${credentials.adAccountId}/adcreatives`,
    {
      method: "POST",
      body: {
        name: `${input.name.slice(0, 80)} Creative`,
        object_story_spec: objectStorySpec
      }
    }
  );
  if (!creative.id) throw new Error("creative id missing");

  const ad = await graphRequest<{ id?: string }>(
    credentials,
    `/${credentials.adAccountId}/ads`,
    {
      method: "POST",
      body: {
        name: `${input.name.slice(0, 80)} Ad`,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status
      }
    }
  );
  if (!ad.id) throw new Error("ad id missing");

  // Activate campaign + adset when requested
  if (status === "ACTIVE") {
    await graphRequest(credentials, `/${campaign.id}`, {
      method: "POST",
      body: { status: "ACTIVE" }
    });
    await graphRequest(credentials, `/${adset.id}`, {
      method: "POST",
      body: { status: "ACTIVE" }
    });
  }

  return {
    campaignId: campaign.id,
    adsetId: adset.id,
    creativeId: creative.id,
    adId: ad.id
  };
}

export async function setMetaObjectStatus(
  credentials: MetaAdsCredentials,
  objectId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<void> {
  await graphRequest(credentials, `/${objectId}`, {
    method: "POST",
    body: { status }
  });
}

export async function fetchMetaObjectStatus(
  credentials: MetaAdsCredentials,
  objectId: string
): Promise<{ configured: string; effective: string }> {
  const payload = await graphRequest<{
    configured_status?: string;
    effective_status?: string;
  }>(credentials, `/${objectId}?fields=configured_status,effective_status`);
  return {
    configured: String(payload.configured_status || ""),
    effective: String(payload.effective_status || "")
  };
}

export function mapMetaEffectiveStatus(effective: string): "active" | "paused" | "pending_review" | "failed" {
  const value = effective.toUpperCase();
  if (value === "ACTIVE") return "active";
  if (value === "PENDING_REVIEW" || value === "IN_PROCESS" || value === "PREAPPROVED") {
    return "pending_review";
  }
  if (
    value === "DISAPPROVED" ||
    value === "WITH_ISSUES" ||
    value === "ARCHIVED" ||
    value === "DELETED"
  ) {
    return "failed";
  }
  // PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED, etc.
  return "paused";
}

/** Meta daily_budget is always in the ad account currency (minor units). */
export function toMetaDailyBudgetCents(
  amountMajor: number,
  currency: string
): number | { error: string } {
  const code = (currency || "USD").toUpperCase();
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    return { error: "budget_too_low" };
  }
  if (code === "USD") {
    const cents = Math.round(amountMajor * 100);
    if (cents < 100) return { error: "budget_too_low" };
    return cents;
  }
  if (code === "KZT") {
    // Approximate FX so UI "KZT" does not send 5000 as $5000 to a USD Meta account.
    const kztPerUsd = Number(process.env.ADS_KZT_PER_USD || 500);
    const rate = Number.isFinite(kztPerUsd) && kztPerUsd > 0 ? kztPerUsd : 500;
    const cents = Math.round((amountMajor / rate) * 100);
    if (cents < 100) return { error: "budget_too_low" };
    return cents;
  }
  return { error: "currency_unsupported" };
}

export async function fetchAdInsights(
  credentials: MetaAdsCredentials,
  adId: string
): Promise<{
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
}> {
  const payload = await graphRequest<{
    data?: Array<{
      spend?: string;
      impressions?: string;
      clicks?: string;
      ctr?: string;
    }>;
  }>(
    credentials,
    `/${adId}/insights?fields=spend,impressions,clicks,ctr&date_preset=last_30d`
  );
  const row = payload.data?.[0];
  const spend = Number(row?.spend || 0);
  const impressions = Number(row?.impressions || 0);
  const clicks = Number(row?.clicks || 0);
  const ctr = Number(row?.ctr || (impressions ? (clicks / impressions) * 100 : 0));
  return { spend, impressions, clicks, ctr };
}
