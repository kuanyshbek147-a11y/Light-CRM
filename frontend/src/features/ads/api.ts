import { API_BASE_URL } from "../../shared/config/api";

const API = API_BASE_URL;

export type AdsSettings = {
  connected: boolean;
  adAccountId: string;
  pageId: string;
  connectedAt: string | null;
  hasToken: boolean;
};

export type AdsAudience = {
  id: string;
  segment_id: string | null;
  name: string;
  meta_audience_id: string | null;
  size: number;
  status: string;
  last_error: string | null;
  last_sync_at: string | null;
  created_at: string;
};

export type AdsCampaign = {
  id: string;
  audience_id: string | null;
  content_post_id: string | null;
  name: string;
  objective: string;
  daily_budget_cents: number;
  currency: string;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  status: string;
  last_error: string | null;
  metrics_json: {
    spend?: number;
    impressions?: number;
    clicks?: number;
    ctr?: number;
  };
  created_at: string;
  audience_name?: string | null;
};

async function authJson<T>(token: string, path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {})
    }
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as T;
}

export async function loadAdsSettings(token: string): Promise<AdsSettings | null> {
  return authJson<AdsSettings>(token, "/ads/settings");
}

export async function saveAdsSettings(
  token: string,
  payload: { accessToken?: string; adAccountId?: string; pageId?: string }
): Promise<AdsSettings | null> {
  return authJson<AdsSettings>(token, "/ads/settings", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function loadAdsAudiences(token: string): Promise<AdsAudience[]> {
  return (await authJson<AdsAudience[]>(token, "/ads/audiences")) || [];
}

export async function syncAdsAudience(
  token: string,
  payload: { segmentId: string; name?: string }
): Promise<AdsAudience | null> {
  return authJson<AdsAudience>(token, "/ads/audiences/sync", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function loadAdsCampaigns(token: string): Promise<AdsCampaign[]> {
  return (await authJson<AdsCampaign[]>(token, "/ads/campaigns")) || [];
}

export async function createAdsCampaign(
  token: string,
  payload: {
    audienceId: string;
    postId?: string;
    name: string;
    dailyBudget: number;
    currency?: string;
    activate?: boolean;
    linkUrl?: string;
  }
): Promise<AdsCampaign | null> {
  return authJson<AdsCampaign>(token, "/ads/campaigns", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function activateAdsCampaign(token: string, campaignId: string): Promise<AdsCampaign | null> {
  return authJson(token, `/ads/campaigns/${campaignId}/activate`, { method: "POST", body: "{}" });
}

export async function pauseAdsCampaign(token: string, campaignId: string): Promise<AdsCampaign | null> {
  return authJson(token, `/ads/campaigns/${campaignId}/pause`, { method: "POST", body: "{}" });
}

export async function refreshAdsCampaignMetrics(
  token: string,
  campaignId: string
): Promise<AdsCampaign | null> {
  const result = await authJson<{ campaign?: AdsCampaign }>(
    token,
    `/ads/campaigns/${campaignId}/refresh-metrics`,
    { method: "POST", body: "{}" }
  );
  return result?.campaign || null;
}
