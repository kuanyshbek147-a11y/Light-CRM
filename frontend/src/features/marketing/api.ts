import { API_BASE_URL } from "../../shared/config/api";

const API = API_BASE_URL;

export type MarketingSegmentFilter = {
  city?: string;
  client_type?: string;
  category?: string;
  channel?: string;
  deal_stage?: string;
};

export type MarketingSegment = {
  id: string;
  name: string;
  filter_json: MarketingSegmentFilter;
  created_at: string;
  updated_at: string;
  contact_count?: number;
};

export type MarketingCampaign = {
  id: string;
  segment_id: string | null;
  segment_name: string | null;
  name: string;
  channel: "whatsapp" | "telegram";
  body: string;
  status: "draft" | "queued" | "sending" | "done" | "cancelled" | "failed";
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  recipients_total?: number;
  recipients_sent?: number;
  recipients_failed?: number;
  recipients_skipped?: number;
  recipients_pending?: number;
};

export type MarketingContentPost = {
  id: string;
  title: string;
  body: string;
  channel: "whatsapp" | "telegram" | "instagram" | "web" | "other";
  status: "idea" | "draft" | "ready" | "published" | "cancelled";
  planned_at: string | null;
  published_at: string | null;
  campaign_id: string | null;
  segment_id: string | null;
  auto_broadcast: boolean;
  auto_publish_social: boolean;
  image_url: string | null;
  social_external_id: string | null;
  publish_error: string | null;
  schedule_processed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingSocialSettings = {
  telegramChannelId: string;
  telegramConnected: boolean;
  instagramConnected: boolean;
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

export async function loadMarketingSegments(token: string): Promise<MarketingSegment[]> {
  return (await authJson<MarketingSegment[]>(token, "/marketing/segments")) || [];
}

export async function createMarketingSegment(
  token: string,
  payload: { name: string; filter: MarketingSegmentFilter }
): Promise<MarketingSegment | null> {
  return authJson<MarketingSegment>(token, "/marketing/segments", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function deleteMarketingSegment(token: string, segmentId: string): Promise<boolean> {
  const response = await fetch(`${API}/marketing/segments/${segmentId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.ok;
}

export async function loadMarketingCampaigns(token: string): Promise<MarketingCampaign[]> {
  return (await authJson<MarketingCampaign[]>(token, "/marketing/campaigns")) || [];
}

export async function createMarketingCampaign(
  token: string,
  payload: {
    name: string;
    segmentId: string;
    channel: "whatsapp" | "telegram";
    body: string;
    templateName?: string;
    templateLang?: string;
  }
): Promise<MarketingCampaign | null> {
  return authJson<MarketingCampaign>(token, "/marketing/campaigns", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function startMarketingCampaign(
  token: string,
  campaignId: string
): Promise<MarketingCampaign | null> {
  return authJson<MarketingCampaign>(token, `/marketing/campaigns/${campaignId}/start`, {
    method: "POST",
    body: "{}"
  });
}

export async function loadMarketingPosts(token: string): Promise<MarketingContentPost[]> {
  return (await authJson<MarketingContentPost[]>(token, "/marketing/posts")) || [];
}

export type CreateMarketingPostPayload = {
  title: string;
  body: string;
  channel: MarketingContentPost["channel"];
  status?: MarketingContentPost["status"];
  plannedAt?: string | null;
  segmentId?: string | null;
  autoBroadcast?: boolean;
  autoPublishSocial?: boolean;
  imageUrl?: string | null;
};

export async function createMarketingPost(
  token: string,
  payload: CreateMarketingPostPayload
): Promise<MarketingContentPost | null> {
  return authJson<MarketingContentPost>(token, "/marketing/posts", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateMarketingPost(
  token: string,
  postId: string,
  payload: Partial<CreateMarketingPostPayload> & { clearScheduleProcessed?: boolean }
): Promise<MarketingContentPost | null> {
  return authJson<MarketingContentPost>(token, `/marketing/posts/${postId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteMarketingPost(token: string, postId: string): Promise<boolean> {
  const response = await fetch(`${API}/marketing/posts/${postId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.ok;
}

export async function publishMarketingPostSocial(
  token: string,
  postId: string
): Promise<MarketingContentPost | null> {
  return authJson<MarketingContentPost>(token, `/marketing/posts/${postId}/publish-social`, {
    method: "POST",
    body: "{}"
  });
}

export async function postToMarketingCampaign(
  token: string,
  postId: string,
  payload: { segmentId: string; channel?: "whatsapp" | "telegram"; start?: boolean }
): Promise<{ post: MarketingContentPost; campaign: MarketingCampaign } | null> {
  return authJson(token, `/marketing/posts/${postId}/to-campaign`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function loadMarketingSocialSettings(
  token: string
): Promise<MarketingSocialSettings | null> {
  return authJson<MarketingSocialSettings>(token, "/marketing/social-settings");
}

export async function saveMarketingSocialSettings(
  token: string,
  payload: { telegramChannelId: string }
): Promise<MarketingSocialSettings | null> {
  return authJson<MarketingSocialSettings>(token, "/marketing/social-settings", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export type MarketingAiStatus = { configured: boolean };

export type GeneratedMarketingDraft = {
  title: string;
  body: string;
  hashtags: string;
  imagePrompt: string;
};

export async function loadMarketingAiStatus(token: string): Promise<MarketingAiStatus | null> {
  return authJson<MarketingAiStatus>(token, "/marketing/ai-status");
}

export async function generateMarketingText(
  token: string,
  payload: { topic: string; channel?: string; tone?: string; offer?: string }
): Promise<GeneratedMarketingDraft | null> {
  return authJson<GeneratedMarketingDraft>(token, "/marketing/generate/text", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function generateMarketingImage(
  token: string,
  payload: { prompt: string; title?: string }
): Promise<{ imageUrl: string; relativeUrl: string } | null> {
  return authJson(token, "/marketing/generate/image", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function generateMarketingWeek(
  token: string,
  payload: {
    topic: string;
    channel?: string;
    tone?: string;
    offer?: string;
    days?: number;
    status?: "draft" | "ready";
    autoPublishSocial?: boolean;
    autoBroadcast?: boolean;
    segmentId?: string | null;
    withImages?: boolean;
  }
): Promise<{ count: number; posts: MarketingContentPost[] } | null> {
  return authJson(token, "/marketing/generate/week", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export type CampaignReport = {
  campaign_id: string;
  name: string;
  status: string;
  channel: string;
  started_at: string | null;
  finished_at: string | null;
  sent: number;
  failed: number;
  skipped: number;
  replied: number;
  reply_rate: number;
  deals_touched: number;
  deals_won: number;
};

export type MarketingSequence = {
  id: string;
  name: string;
  segment_id: string | null;
  channel: "whatsapp" | "telegram";
  step0_body: string;
  step3_body: string;
  step7_body: string;
  template_name: string | null;
  template_lang: string | null;
  status: string;
  created_at: string;
  pending_runs?: number;
};

export async function loadCampaignReports(token: string): Promise<CampaignReport[]> {
  return (await authJson<CampaignReport[]>(token, "/marketing/reports/campaigns")) || [];
}

export async function approveMarketingPost(
  token: string,
  postId: string
): Promise<MarketingContentPost | null> {
  return authJson(token, `/marketing/posts/${postId}/approve`, { method: "POST", body: "{}" });
}

export async function rewriteMarketingPost(
  token: string,
  postId: string
): Promise<MarketingContentPost | null> {
  return authJson(token, `/marketing/posts/${postId}/rewrite`, { method: "POST", body: "{}" });
}

export async function loadMarketingSequences(token: string): Promise<MarketingSequence[]> {
  return (await authJson<MarketingSequence[]>(token, "/marketing/sequences")) || [];
}

export async function createMarketingSequence(
  token: string,
  payload: {
    name: string;
    segmentId: string;
    channel: "whatsapp" | "telegram";
    step0Body: string;
    step3Body: string;
    step7Body: string;
    templateName?: string;
    templateLang?: string;
  }
): Promise<MarketingSequence | null> {
  return authJson(token, "/marketing/sequences", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function startMarketingSequence(
  token: string,
  sequenceId: string
): Promise<MarketingSequence | null> {
  return authJson(token, `/marketing/sequences/${sequenceId}/start`, {
    method: "POST",
    body: "{}"
  });
}
