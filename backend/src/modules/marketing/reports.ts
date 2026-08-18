import { query } from "../../db";

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

export async function getCampaignReports(workspaceId: string): Promise<CampaignReport[]> {
  const rows = await query<{
    campaign_id: string;
    name: string;
    status: string;
    channel: string;
    started_at: string | null;
    finished_at: string | null;
    sent: string;
    failed: string;
    skipped: string;
    replied: string;
    deals_touched: string;
    deals_won: string;
  }>(
    `SELECT c.id AS campaign_id, c.name, c.status, c.channel, c.started_at, c.finished_at,
            COUNT(*) FILTER (WHERE r.status = 'sent')::text AS sent,
            COUNT(*) FILTER (WHERE r.status = 'failed')::text AS failed,
            COUNT(*) FILTER (WHERE r.status = 'skipped')::text AS skipped,
            COUNT(DISTINCT r.contact_id) FILTER (
              WHERE r.status = 'sent'
                AND EXISTS (
                  SELECT 1 FROM messages m
                  WHERE m.conversation_id = r.conversation_id
                    AND m.direction = 'incoming'
                    AND m.created_at > COALESCE(r.sent_at, c.started_at, c.created_at)
                )
            )::text AS replied,
            COUNT(DISTINCT d.id)::text AS deals_touched,
            COUNT(DISTINCT d.id) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM pipeline_stages ps
                WHERE ps.workspace_id = c.workspace_id
                  AND lower(ps.name) = lower(d.stage)
                  AND ps.outcome = 'won'
              )
            )::text AS deals_won
     FROM marketing_campaigns c
     LEFT JOIN marketing_campaign_recipients r ON r.campaign_id = c.id
     LEFT JOIN conversations conv ON conv.id = r.conversation_id
     LEFT JOIN deals d ON d.conversation_id = conv.id AND d.workspace_id = c.workspace_id
     WHERE c.workspace_id = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC
     LIMIT 50`,
    [workspaceId]
  );

  return rows.map((row) => {
    const sent = Number(row.sent || 0);
    const replied = Number(row.replied || 0);
    return {
      campaign_id: row.campaign_id,
      name: row.name,
      status: row.status,
      channel: row.channel,
      started_at: row.started_at,
      finished_at: row.finished_at,
      sent,
      failed: Number(row.failed || 0),
      skipped: Number(row.skipped || 0),
      replied,
      reply_rate: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
      deals_touched: Number(row.deals_touched || 0),
      deals_won: Number(row.deals_won || 0)
    };
  });
}

export type LandingRoiRow = {
  landing_id: string;
  title: string;
  slug: string;
  clicks: number;
  leads: number;
  won_deals: number;
  revenue: number;
  cpa: number | null;
  roas: number | null;
};

export type AdsRoiRow = {
  campaign_id: string;
  name: string;
  status: string;
  spend: number;
  clicks: number;
  leads: number;
  won_deals: number;
  revenue: number;
  cpa: number | null;
  roas: number | null;
};

function metricNumber(metrics: Record<string, unknown>, key: string): number {
  const value = metrics[key];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number(value) || 0;
  }
  return 0;
}

export async function getMarketingRoiReport(workspaceId: string): Promise<{
  landings: LandingRoiRow[];
  ads: AdsRoiRow[];
}> {
  const landingRows = await query<{
    landing_id: string;
    title: string;
    slug: string;
    clicks: string;
    leads: string;
    won_deals: string;
    revenue: string;
  }>(
    `SELECT lp.id AS landing_id,
            lp.title,
            lp.slug,
            COALESCE(lp.click_count, 0)::text AS clicks,
            COUNT(DISTINCT ct.id)::text AS leads,
            COUNT(DISTINCT d.id) FILTER (
              WHERE COALESCE(ps.outcome, 'open') = 'won'
            )::text AS won_deals,
            COALESCE(SUM(d.amount) FILTER (
              WHERE COALESCE(ps.outcome, 'open') = 'won'
            ), 0)::text AS revenue
     FROM marketing_landing_pages lp
     LEFT JOIN contacts ct
       ON ct.workspace_id = lp.workspace_id
      AND ct.landing_id = lp.id
     LEFT JOIN conversations c
       ON c.contact_id = ct.id
      AND c.workspace_id = lp.workspace_id
     LEFT JOIN deals d
       ON d.conversation_id = c.id
      AND d.workspace_id = lp.workspace_id
     LEFT JOIN pipeline_stages ps
       ON ps.workspace_id = d.workspace_id
      AND lower(ps.name) = lower(d.stage)
     WHERE lp.workspace_id = $1
     GROUP BY lp.id
     ORDER BY COALESCE(SUM(d.amount) FILTER (WHERE COALESCE(ps.outcome, 'open') = 'won'), 0) DESC,
              COALESCE(lp.click_count, 0) DESC
     LIMIT 50`,
    [workspaceId]
  );

  const adsRows = await query<{
    campaign_id: string;
    name: string;
    status: string;
    metrics_json: Record<string, unknown> | null;
    leads: string;
    won_deals: string;
    revenue: string;
  }>(
    `SELECT ac.id AS campaign_id,
            ac.name,
            ac.status,
            ac.metrics_json,
            COUNT(DISTINCT ct.id)::text AS leads,
            COUNT(DISTINCT d.id) FILTER (
              WHERE COALESCE(ps.outcome, 'open') = 'won'
            )::text AS won_deals,
            COALESCE(SUM(d.amount) FILTER (
              WHERE COALESCE(ps.outcome, 'open') = 'won'
            ), 0)::text AS revenue
     FROM ads_campaigns ac
     LEFT JOIN contacts ct
       ON ct.workspace_id = ac.workspace_id
      AND (
        ct.utm_campaign ILIKE '%' || ac.name || '%'
        OR ct.utm_content = ac.id::text
        OR ct.utm_campaign = ac.id::text
      )
     LEFT JOIN conversations c
       ON c.contact_id = ct.id
      AND c.workspace_id = ac.workspace_id
     LEFT JOIN deals d
       ON d.conversation_id = c.id
      AND d.workspace_id = ac.workspace_id
     LEFT JOIN pipeline_stages ps
       ON ps.workspace_id = d.workspace_id
      AND lower(ps.name) = lower(d.stage)
     WHERE ac.workspace_id = $1
     GROUP BY ac.id
     ORDER BY ac.created_at DESC
     LIMIT 50`,
    [workspaceId]
  );

  const landings: LandingRoiRow[] = landingRows.map((row) => {
    const leads = Number(row.leads || 0);
    const revenue = Number(row.revenue || 0);
    const clicks = Number(row.clicks || 0);
    return {
      landing_id: row.landing_id,
      title: row.title,
      slug: row.slug,
      clicks,
      leads,
      won_deals: Number(row.won_deals || 0),
      revenue,
      cpa: null,
      roas: null
    };
  });

  const ads: AdsRoiRow[] = adsRows.map((row) => {
    const metrics = (row.metrics_json || {}) as Record<string, unknown>;
    const spend = metricNumber(metrics, "spend");
    const clicks = metricNumber(metrics, "clicks");
    const leads = Number(row.leads || 0);
    const revenue = Number(row.revenue || 0);
    return {
      campaign_id: row.campaign_id,
      name: row.name,
      status: row.status,
      spend,
      clicks,
      leads,
      won_deals: Number(row.won_deals || 0),
      revenue,
      cpa: spend > 0 && leads > 0 ? Math.round((spend / leads) * 100) / 100 : null,
      roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null
    };
  });

  return { landings, ads };
}

export type MarketingInboundReport = {
  periodDays: number;
  posts: {
    total: number;
    published: number;
    ready: number;
    withError: number;
    items: Array<{
      id: string;
      title: string;
      status: string;
      planned_at: string | null;
      published_at: string | null;
      publish_error: string | null;
      social_external_id: string | null;
    }>;
  };
  inbound: {
    instagramDialogs: number;
    whatsappDialogs: number;
    telegramDialogs: number;
    demoRequests: number;
    dealsOpen: number;
    dealsWon: number;
    revenueWon: number;
  };
  demos: Array<{
    conversation_id: string;
    contact_name: string;
    channel: string;
    preview: string;
    created_at: string;
    deal_stage: string | null;
    deal_outcome: string | null;
  }>;
};

export async function getMarketingInboundReport(
  workspaceId: string,
  periodDays = 14
): Promise<MarketingInboundReport> {
  const days = Math.min(90, Math.max(1, Number(periodDays) || 14));

  const postRows = await query<{
    id: string;
    title: string;
    status: string;
    planned_at: string | null;
    published_at: string | null;
    publish_error: string | null;
    social_external_id: string | null;
  }>(
    `SELECT id, title, status, planned_at::text, published_at::text,
            publish_error, social_external_id
     FROM marketing_content_posts
     WHERE workspace_id = $1 AND channel = 'instagram'
     ORDER BY
       CASE status
         WHEN 'ready' THEN 0
         WHEN 'published' THEN 1
         WHEN 'draft' THEN 2
         ELSE 3
       END,
       planned_at ASC NULLS LAST,
       created_at DESC
     LIMIT 30`,
    [workspaceId]
  );

  const channelRows = await query<{ channel: string; cnt: string }>(
    `SELECT channel, COUNT(*)::text AS cnt
     FROM conversations
     WHERE workspace_id = $1
       AND created_at >= now() - ($2::text || ' days')::interval
       AND channel IN ('instagram', 'whatsapp', 'telegram')
     GROUP BY channel`,
    [workspaceId, String(days)]
  );
  const byChannel = Object.fromEntries(channelRows.map((row) => [row.channel, Number(row.cnt || 0)]));

  const demoAgg = await query<{
    demo_requests: string;
    deals_open: string;
    deals_won: string;
    revenue_won: string;
  }>(
    `WITH demo_convos AS (
       SELECT DISTINCT c.id AS conversation_id
       FROM conversations c
       JOIN messages m ON m.conversation_id = c.id AND m.workspace_id = c.workspace_id
       WHERE c.workspace_id = $1
         AND m.direction = 'incoming'
         AND m.created_at >= now() - ($2::text || ' days')::interval
         AND (
           m.body ILIKE '%демо%'
           OR m.body ILIKE '%demo%'
           OR m.body ILIKE '%пилот%'
           OR m.body ILIKE '%записаться%'
         )
     )
     SELECT
       (SELECT COUNT(*)::text FROM demo_convos) AS demo_requests,
       (
         SELECT COUNT(*)::text
         FROM deals d
         JOIN demo_convos dc ON dc.conversation_id = d.conversation_id
         LEFT JOIN pipeline_stages ps
           ON ps.workspace_id = d.workspace_id AND lower(ps.name) = lower(d.stage)
         WHERE d.workspace_id = $1 AND COALESCE(ps.outcome, 'open') = 'open'
       ) AS deals_open,
       (
         SELECT COUNT(*)::text
         FROM deals d
         JOIN demo_convos dc ON dc.conversation_id = d.conversation_id
         LEFT JOIN pipeline_stages ps
           ON ps.workspace_id = d.workspace_id AND lower(ps.name) = lower(d.stage)
         WHERE d.workspace_id = $1 AND COALESCE(ps.outcome, 'open') = 'won'
       ) AS deals_won,
       (
         SELECT COALESCE(SUM(d.amount), 0)::text
         FROM deals d
         JOIN demo_convos dc ON dc.conversation_id = d.conversation_id
         LEFT JOIN pipeline_stages ps
           ON ps.workspace_id = d.workspace_id AND lower(ps.name) = lower(d.stage)
         WHERE d.workspace_id = $1 AND COALESCE(ps.outcome, 'open') = 'won'
       ) AS revenue_won`,
    [workspaceId, String(days)]
  );

  const demoRows = await query<{
    conversation_id: string;
    contact_name: string;
    channel: string;
    preview: string;
    created_at: string;
    deal_stage: string | null;
    deal_outcome: string | null;
  }>(
    `SELECT DISTINCT ON (c.id)
            c.id AS conversation_id,
            COALESCE(NULLIF(ct.name, ''), ct.phone, 'Без имени') AS contact_name,
            c.channel,
            LEFT(m.body, 160) AS preview,
            m.created_at::text AS created_at,
            d.stage AS deal_stage,
            COALESCE(ps.outcome, 'open') AS deal_outcome
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     JOIN messages m
       ON m.conversation_id = c.id
      AND m.workspace_id = c.workspace_id
      AND m.direction = 'incoming'
     LEFT JOIN deals d ON d.conversation_id = c.id AND d.workspace_id = c.workspace_id
     LEFT JOIN pipeline_stages ps
       ON ps.workspace_id = c.workspace_id AND lower(ps.name) = lower(d.stage)
     WHERE c.workspace_id = $1
       AND m.created_at >= now() - ($2::text || ' days')::interval
       AND (
         m.body ILIKE '%демо%'
         OR m.body ILIKE '%demo%'
         OR m.body ILIKE '%пилот%'
         OR m.body ILIKE '%записаться%'
       )
     ORDER BY c.id, m.created_at DESC
     LIMIT 30`,
    [workspaceId, String(days)]
  );

  const agg = demoAgg[0];
  return {
    periodDays: days,
    posts: {
      total: postRows.length,
      published: postRows.filter((row) => row.status === "published").length,
      ready: postRows.filter((row) => row.status === "ready").length,
      withError: postRows.filter((row) => Boolean(row.publish_error)).length,
      items: postRows
    },
    inbound: {
      instagramDialogs: byChannel.instagram || 0,
      whatsappDialogs: byChannel.whatsapp || 0,
      telegramDialogs: byChannel.telegram || 0,
      demoRequests: Number(agg?.demo_requests || 0),
      dealsOpen: Number(agg?.deals_open || 0),
      dealsWon: Number(agg?.deals_won || 0),
      revenueWon: Number(agg?.revenue_won || 0)
    },
    demos: demoRows.map((row) => ({
      ...row,
      preview: String(row.preview || "").trim()
    }))
  };
}

