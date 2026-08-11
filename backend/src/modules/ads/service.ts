import { query } from "../../db";
import { getContentPost } from "../marketing/posts";
import { getSegment, resolveSegmentContacts } from "../marketing/segments";
import { getMetaAdsCredentialsForWorkspace } from "./credentials";
import {
  createCustomAudience,
  createTrafficCampaign,
  fetchAdInsights,
  getAudienceApproxSize,
  setMetaObjectStatus,
  uploadAudiencePhones
} from "./meta-marketing";

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
  metrics_json: Record<string, unknown>;
  created_at: string;
  audience_name?: string | null;
};

function publicBase(): string {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "https://light-crm-backend.onrender.com"
  ).replace(/\/+$/, "");
}

export async function listAdsAudiences(workspaceId: string): Promise<AdsAudience[]> {
  return query<AdsAudience>(
    `SELECT id, segment_id, name, meta_audience_id, size, status, last_error, last_sync_at, created_at
     FROM ads_audiences
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [workspaceId]
  );
}

export async function listAdsCampaigns(workspaceId: string): Promise<AdsCampaign[]> {
  return query<AdsCampaign>(
    `SELECT c.id, c.audience_id, c.content_post_id, c.name, c.objective, c.daily_budget_cents,
            c.currency, c.meta_campaign_id, c.meta_adset_id, c.meta_ad_id, c.status,
            c.last_error, c.metrics_json, c.created_at, a.name AS audience_name
     FROM ads_campaigns c
     LEFT JOIN ads_audiences a ON a.id = c.audience_id
     WHERE c.workspace_id = $1
     ORDER BY c.created_at DESC
     LIMIT 100`,
    [workspaceId]
  );
}

export async function syncAudienceFromSegment(input: {
  workspaceId: string;
  segmentId: string;
  name?: string;
}): Promise<AdsAudience | { error: string }> {
  const credentials = await getMetaAdsCredentialsForWorkspace(input.workspaceId);
  if (!credentials) {
    return { error: "ads_not_connected" };
  }

  const segment = await getSegment(input.workspaceId, input.segmentId);
  if (!segment) {
    return { error: "segment_not_found" };
  }

  const contacts = await resolveSegmentContacts(input.workspaceId, segment.filter_json || {}, 5000);
  const phones = contacts.map((c) => c.phone || "").filter(Boolean);
  if (!phones.length) {
    return { error: "segment_no_phones" };
  }

  const name = (input.name || `CRM · ${segment.name}`).slice(0, 100);

  const existing = await query<AdsAudience>(
    `SELECT id, segment_id, name, meta_audience_id, size, status, last_error, last_sync_at, created_at
     FROM ads_audiences
     WHERE workspace_id = $1 AND segment_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.workspaceId, input.segmentId]
  );

  let audienceRow = existing[0];
  try {
    if (!audienceRow) {
      const inserted = await query<AdsAudience>(
        `INSERT INTO ads_audiences (workspace_id, segment_id, name, status)
         VALUES ($1, $2, $3, 'syncing')
         RETURNING id, segment_id, name, meta_audience_id, size, status, last_error, last_sync_at, created_at`,
        [input.workspaceId, input.segmentId, name]
      );
      audienceRow = inserted[0];
    } else {
      await query(
        `UPDATE ads_audiences SET status = 'syncing', last_error = NULL, updated_at = now() WHERE id = $1`,
        [audienceRow.id]
      );
    }

    let metaAudienceId = audienceRow.meta_audience_id;
    if (!metaAudienceId) {
      metaAudienceId = await createCustomAudience(
        credentials,
        name,
        `Synced from Light CRM segment ${segment.name}`
      );
      await query(`UPDATE ads_audiences SET meta_audience_id = $1 WHERE id = $2`, [
        metaAudienceId,
        audienceRow.id
      ]);
    }

    const upload = await uploadAudiencePhones(credentials, metaAudienceId, phones);
    let size = upload.received;
    try {
      size = (await getAudienceApproxSize(credentials, metaAudienceId)) || upload.received;
    } catch {
      // approximate count may lag; keep upload received
    }

    const updated = await query<AdsAudience>(
      `UPDATE ads_audiences
       SET status = 'ready',
           size = $1,
           last_sync_at = now(),
           last_error = NULL,
           name = $2,
           updated_at = now()
       WHERE id = $3
       RETURNING id, segment_id, name, meta_audience_id, size, status, last_error, last_sync_at, created_at`,
      [size, name, audienceRow.id]
    );
    return updated[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : "sync_failed";
    if (audienceRow?.id) {
      await query(
        `UPDATE ads_audiences
         SET status = 'failed', last_error = $1, updated_at = now()
         WHERE id = $2`,
        [message.slice(0, 500), audienceRow.id]
      );
    }
    return { error: message };
  }
}

export async function createAdsCampaign(input: {
  workspaceId: string;
  userId: string;
  audienceId: string;
  postId?: string | null;
  name: string;
  dailyBudget: number;
  currency?: string;
  activate?: boolean;
  linkUrl?: string;
}): Promise<AdsCampaign | { error: string }> {
  const credentials = await getMetaAdsCredentialsForWorkspace(input.workspaceId);
  if (!credentials) {
    return { error: "ads_not_connected" };
  }
  if (!credentials.pageId) {
    return { error: "ads_page_required" };
  }

  const audience = await query<AdsAudience & { meta_audience_id: string | null }>(
    `SELECT id, segment_id, name, meta_audience_id, size, status, last_error, last_sync_at, created_at
     FROM ads_audiences
     WHERE id = $1 AND workspace_id = $2
     LIMIT 1`,
    [input.audienceId, input.workspaceId]
  );
  const aud = audience[0];
  if (!aud?.meta_audience_id) {
    return { error: "audience_not_synced" };
  }

  const name = input.name.trim();
  if (!name) {
    return { error: "campaign_name_required" };
  }

  const dailyBudgetCents = Math.round(Number(input.dailyBudget) * 100);
  if (!Number.isFinite(dailyBudgetCents) || dailyBudgetCents < 100) {
    return { error: "budget_too_low" };
  }

  let message = name;
  let imageUrl: string | null = null;
  let contentPostId: string | null = input.postId || null;
  if (contentPostId) {
    const post = await getContentPost(input.workspaceId, contentPostId);
    if (post) {
      message = [post.title, post.body].filter(Boolean).join("\n\n").slice(0, 2000);
      imageUrl = post.image_url;
    } else {
      contentPostId = null;
    }
  }

  const linkUrl =
    (input.linkUrl || "").trim() ||
    process.env.ADS_DEFAULT_LINK_URL ||
    "https://light-crm-kz.netlify.app";

  const draft = await query<AdsCampaign>(
    `INSERT INTO ads_campaigns
       (workspace_id, audience_id, content_post_id, name, objective, daily_budget_cents,
        currency, status, created_by_user_id)
     VALUES ($1,$2,$3,$4,'OUTCOME_TRAFFIC',$5,$6,'draft',$7)
     RETURNING id, audience_id, content_post_id, name, objective, daily_budget_cents, currency,
               meta_campaign_id, meta_adset_id, meta_ad_id, status, last_error, metrics_json, created_at`,
    [
      input.workspaceId,
      input.audienceId,
      contentPostId,
      name,
      dailyBudgetCents,
      (input.currency || "USD").toUpperCase(),
      input.userId
    ]
  );
  const campaign = draft[0];

  try {
    // Absolute image URL if relative
    let picture = imageUrl;
    if (picture && picture.startsWith("/")) {
      picture = `${publicBase()}${picture}`;
    }

    const created = await createTrafficCampaign(credentials, {
      name,
      audienceId: aud.meta_audience_id,
      pageId: credentials.pageId,
      dailyBudgetCents,
      message,
      linkUrl,
      imageUrl: picture,
      status: input.activate ? "ACTIVE" : "PAUSED"
    });

    const updated = await query<AdsCampaign>(
      `UPDATE ads_campaigns
       SET meta_campaign_id = $1,
           meta_adset_id = $2,
           meta_creative_id = $3,
           meta_ad_id = $4,
           status = $5,
           last_error = NULL,
           updated_at = now()
       WHERE id = $6
       RETURNING id, audience_id, content_post_id, name, objective, daily_budget_cents, currency,
                 meta_campaign_id, meta_adset_id, meta_ad_id, status, last_error, metrics_json, created_at`,
      [
        created.campaignId,
        created.adsetId,
        created.creativeId,
        created.adId,
        input.activate ? "pending_review" : "paused",
        campaign.id
      ]
    );
    return updated[0];
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "campaign_create_failed";
    await query(
      `UPDATE ads_campaigns
       SET status = 'failed', last_error = $1, updated_at = now()
       WHERE id = $2`,
      [messageText.slice(0, 500), campaign.id]
    );
    return { error: messageText };
  }
}

export async function setAdsCampaignStatus(
  workspaceId: string,
  campaignId: string,
  next: "active" | "paused"
): Promise<AdsCampaign | { error: string }> {
  const credentials = await getMetaAdsCredentialsForWorkspace(workspaceId);
  if (!credentials) {
    return { error: "ads_not_connected" };
  }
  const rows = await query<AdsCampaign>(
    `SELECT id, audience_id, content_post_id, name, objective, daily_budget_cents, currency,
            meta_campaign_id, meta_adset_id, meta_ad_id, status, last_error, metrics_json, created_at
     FROM ads_campaigns
     WHERE id = $1 AND workspace_id = $2
     LIMIT 1`,
    [campaignId, workspaceId]
  );
  const campaign = rows[0];
  if (!campaign) {
    return { error: "campaign_not_found" };
  }
  if (!campaign.meta_campaign_id || !campaign.meta_adset_id || !campaign.meta_ad_id) {
    return { error: "campaign_not_on_meta" };
  }

  const metaStatus = next === "active" ? "ACTIVE" : "PAUSED";
  try {
    await setMetaObjectStatus(credentials, campaign.meta_campaign_id, metaStatus);
    await setMetaObjectStatus(credentials, campaign.meta_adset_id, metaStatus);
    await setMetaObjectStatus(credentials, campaign.meta_ad_id, metaStatus);
    const updated = await query<AdsCampaign>(
      `UPDATE ads_campaigns
       SET status = $1, last_error = NULL, updated_at = now()
       WHERE id = $2
       RETURNING id, audience_id, content_post_id, name, objective, daily_budget_cents, currency,
                 meta_campaign_id, meta_adset_id, meta_ad_id, status, last_error, metrics_json, created_at`,
      [next === "active" ? "pending_review" : "paused", campaignId]
    );
    return updated[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : "status_update_failed";
    await query(
      `UPDATE ads_campaigns SET last_error = $1, updated_at = now() WHERE id = $2`,
      [message.slice(0, 500), campaignId]
    );
    return { error: message };
  }
}

export async function refreshCampaignMetrics(workspaceId: string, campaignId?: string): Promise<number> {
  const credentials = await getMetaAdsCredentialsForWorkspace(workspaceId);
  if (!credentials) {
    return 0;
  }
  const rows = await query<{ id: string; meta_ad_id: string | null }>(
    `SELECT id, meta_ad_id FROM ads_campaigns
     WHERE workspace_id = $1
       AND meta_ad_id IS NOT NULL
       AND ($2::uuid IS NULL OR id = $2::uuid)
     ORDER BY updated_at ASC
     LIMIT 20`,
    [workspaceId, campaignId || null]
  );

  let updated = 0;
  for (const row of rows) {
    if (!row.meta_ad_id) continue;
    try {
      const metrics = await fetchAdInsights(credentials, row.meta_ad_id);
      await query(
        `UPDATE ads_campaigns
         SET metrics_json = $1::jsonb, updated_at = now()
         WHERE id = $2`,
        [JSON.stringify(metrics), row.id]
      );
      updated += 1;
    } catch {
      // ignore per-ad failures
    }
  }
  return updated;
}

let adsTimer: NodeJS.Timeout | null = null;

export function startAdsMetricsWorker(): void {
  if (adsTimer) return;
  adsTimer = setInterval(() => {
    void (async () => {
      const workspaces = await query<{ workspace_id: string }>(
        `SELECT DISTINCT workspace_id FROM ads_campaigns
         WHERE status IN ('active', 'pending_review', 'paused')
         LIMIT 20`
      );
      for (const row of workspaces) {
        await refreshCampaignMetrics(row.workspace_id);
      }
    })();
  }, 15 * 60_000);
}
