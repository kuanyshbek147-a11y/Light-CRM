import { query } from "../../db";
import { createCampaign, startCampaign, type CampaignChannel, type MarketingCampaign } from "./campaigns";
import { publishPostToSocial } from "./social";

export type ContentPostChannel = "whatsapp" | "telegram" | "instagram" | "web" | "other";
export type ContentPostStatus = "idea" | "draft" | "ready" | "published" | "cancelled";

export type MarketingContentPost = {
  id: string;
  workspace_id?: string;
  title: string;
  body: string;
  channel: ContentPostChannel;
  status: ContentPostStatus;
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
  created_by_user_id?: string | null;
};

const CHANNELS = new Set(["whatsapp", "telegram", "instagram", "web", "other"]);
const STATUSES = new Set(["idea", "draft", "ready", "published", "cancelled"]);

const POST_SELECT = `id, title, body, channel, status, planned_at, published_at, campaign_id,
  segment_id, auto_broadcast, auto_publish_social, image_url, social_external_id,
  publish_error, schedule_processed_at, created_at, updated_at`;

function normalizeChannel(value: unknown): ContentPostChannel {
  const channel = String(value || "whatsapp").trim().toLowerCase();
  return (CHANNELS.has(channel) ? channel : "whatsapp") as ContentPostChannel;
}

function normalizeStatus(value: unknown, fallback: ContentPostStatus = "idea"): ContentPostStatus {
  const status = String(value || fallback).trim().toLowerCase();
  return (STATUSES.has(status) ? status : fallback) as ContentPostStatus;
}

function mapPost(row: MarketingContentPost): MarketingContentPost {
  return {
    ...row,
    auto_broadcast: Boolean(row.auto_broadcast),
    auto_publish_social: Boolean(row.auto_publish_social)
  };
}

export async function listContentPosts(workspaceId: string): Promise<MarketingContentPost[]> {
  const rows = await query<MarketingContentPost>(
    `SELECT ${POST_SELECT}
     FROM marketing_content_posts
     WHERE workspace_id = $1
     ORDER BY
       CASE status
         WHEN 'idea' THEN 0
         WHEN 'draft' THEN 1
         WHEN 'ready' THEN 2
         WHEN 'published' THEN 3
         ELSE 4
       END,
       planned_at ASC NULLS LAST,
       created_at DESC
     LIMIT 200`,
    [workspaceId]
  );
  return rows.map(mapPost);
}

export async function getContentPost(
  workspaceId: string,
  postId: string
): Promise<MarketingContentPost | null> {
  const rows = await query<MarketingContentPost>(
    `SELECT ${POST_SELECT}
     FROM marketing_content_posts
     WHERE id = $1 AND workspace_id = $2
     LIMIT 1`,
    [postId, workspaceId]
  );
  return rows[0] ? mapPost(rows[0]) : null;
}

export async function createContentPost(input: {
  workspaceId: string;
  userId: string;
  title: string;
  body: string;
  channel?: string;
  status?: string;
  plannedAt?: string | null;
  segmentId?: string | null;
  autoBroadcast?: boolean;
  autoPublishSocial?: boolean;
  imageUrl?: string | null;
}): Promise<MarketingContentPost | { error: string }> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) {
    return { error: "post_title_required" };
  }
  if (!body) {
    return { error: "post_body_required" };
  }

  const rows = await query<MarketingContentPost>(
    `INSERT INTO marketing_content_posts
       (workspace_id, title, body, channel, status, planned_at, segment_id,
        auto_broadcast, auto_publish_social, image_url, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::timestamp, NULLIF($7, '')::uuid,
             $8, $9, NULLIF($10, ''), $11)
     RETURNING ${POST_SELECT}`,
    [
      input.workspaceId,
      title,
      body,
      normalizeChannel(input.channel),
      normalizeStatus(input.status, "idea"),
      input.plannedAt || "",
      input.segmentId || "",
      Boolean(input.autoBroadcast),
      Boolean(input.autoPublishSocial),
      (input.imageUrl || "").trim(),
      input.userId
    ]
  );
  return mapPost(rows[0]);
}

export async function updateContentPost(input: {
  workspaceId: string;
  postId: string;
  title?: string;
  body?: string;
  channel?: string;
  status?: string;
  plannedAt?: string | null;
  segmentId?: string | null;
  autoBroadcast?: boolean;
  autoPublishSocial?: boolean;
  imageUrl?: string | null;
  clearScheduleProcessed?: boolean;
}): Promise<MarketingContentPost | null> {
  const existing = await getContentPost(input.workspaceId, input.postId);
  if (!existing) {
    return null;
  }

  const title = input.title !== undefined ? input.title.trim() : existing.title;
  const body = input.body !== undefined ? input.body.trim() : existing.body;
  if (!title || !body) {
    return null;
  }

  const status = input.status !== undefined ? normalizeStatus(input.status, existing.status) : existing.status;
  const channel = input.channel !== undefined ? normalizeChannel(input.channel) : existing.channel;
  const plannedAt =
    input.plannedAt !== undefined ? input.plannedAt || "" : existing.planned_at || "";
  const segmentId =
    input.segmentId !== undefined ? input.segmentId || "" : existing.segment_id || "";
  const autoBroadcast =
    input.autoBroadcast !== undefined ? Boolean(input.autoBroadcast) : existing.auto_broadcast;
  const autoPublishSocial =
    input.autoPublishSocial !== undefined
      ? Boolean(input.autoPublishSocial)
      : existing.auto_publish_social;
  const imageUrl =
    input.imageUrl !== undefined ? (input.imageUrl || "").trim() : existing.image_url || "";

  let publishedAt: string | null = existing.published_at;
  if (status === "published") {
    publishedAt = existing.published_at || new Date().toISOString();
  } else {
    publishedAt = null;
  }

  const rows = await query<MarketingContentPost>(
    `UPDATE marketing_content_posts
     SET title = $1,
         body = $2,
         channel = $3,
         status = $4,
         planned_at = NULLIF($5, '')::timestamp,
         published_at = NULLIF($6, '')::timestamptz,
         segment_id = NULLIF($7, '')::uuid,
         auto_broadcast = $8,
         auto_publish_social = $9,
         image_url = NULLIF($10, ''),
         schedule_processed_at = CASE
           WHEN $11 THEN NULL
           ELSE schedule_processed_at
         END,
         publish_error = CASE WHEN $11 THEN NULL ELSE publish_error END,
         updated_at = now()
     WHERE id = $12 AND workspace_id = $13
     RETURNING ${POST_SELECT}`,
    [
      title,
      body,
      channel,
      status,
      plannedAt,
      publishedAt || "",
      segmentId,
      autoBroadcast,
      autoPublishSocial,
      imageUrl,
      Boolean(input.clearScheduleProcessed),
      input.postId,
      input.workspaceId
    ]
  );
  return rows[0] ? mapPost(rows[0]) : null;
}

export async function deleteContentPost(workspaceId: string, postId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM marketing_content_posts
     WHERE id = $1 AND workspace_id = $2
     RETURNING id`,
    [postId, workspaceId]
  );
  return Boolean(rows[0]);
}

function campaignChannelFromPost(channel: ContentPostChannel): CampaignChannel {
  return channel === "telegram" ? "telegram" : "whatsapp";
}

export async function createCampaignFromPost(input: {
  workspaceId: string;
  userId: string;
  postId: string;
  segmentId: string;
  channel?: string;
  start?: boolean;
}): Promise<
  | { post: MarketingContentPost; campaign: MarketingCampaign }
  | { error: string }
> {
  const post = await getContentPost(input.workspaceId, input.postId);
  if (!post) {
    return { error: "post_not_found" };
  }

  const channelRaw = String(input.channel || "").trim().toLowerCase();
  const channel: CampaignChannel =
    channelRaw === "telegram" || channelRaw === "whatsapp"
      ? channelRaw
      : campaignChannelFromPost(post.channel);

  const created = await createCampaign({
    workspaceId: input.workspaceId,
    userId: input.userId,
    name: `Пост: ${post.title}`.slice(0, 120),
    segmentId: input.segmentId,
    channel,
    body: post.body
  });
  if ("error" in created) {
    return created;
  }

  let campaign = created;
  if (input.start) {
    const started = await startCampaign(input.workspaceId, created.id);
    if (!("error" in started)) {
      campaign = started;
    }
  }

  const rows = await query<MarketingContentPost>(
    `UPDATE marketing_content_posts
     SET campaign_id = $1,
         segment_id = COALESCE(segment_id, NULLIF($4, '')::uuid),
         status = CASE
           WHEN status IN ('idea', 'draft') THEN 'ready'
           ELSE status
         END,
         updated_at = now()
     WHERE id = $2 AND workspace_id = $3
     RETURNING ${POST_SELECT}`,
    [campaign.id, post.id, input.workspaceId, input.segmentId]
  );

  return {
    post: rows[0] ? mapPost(rows[0]) : post,
    campaign
  };
}

export async function markPostsPublishedForCampaign(campaignId: string): Promise<void> {
  await query(
    `UPDATE marketing_content_posts
     SET status = 'published',
         published_at = COALESCE(published_at, now()),
         publish_error = NULL,
         updated_at = now()
     WHERE campaign_id = $1
       AND status <> 'cancelled'`,
    [campaignId]
  );
}

export async function publishContentPostSocial(
  workspaceId: string,
  postId: string
): Promise<MarketingContentPost | { error: string }> {
  const post = await getContentPost(workspaceId, postId);
  if (!post) {
    return { error: "post_not_found" };
  }
  try {
    const result = await publishPostToSocial({
      workspaceId,
      channel: post.channel,
      title: post.title,
      body: post.body,
      imageUrl: post.image_url
    });
    const rows = await query<MarketingContentPost>(
      `UPDATE marketing_content_posts
       SET social_external_id = $1,
           status = 'published',
           published_at = COALESCE(published_at, now()),
           publish_error = NULL,
           schedule_processed_at = COALESCE(schedule_processed_at, now()),
           updated_at = now()
       WHERE id = $2 AND workspace_id = $3
       RETURNING ${POST_SELECT}`,
      [`${result.target}:${result.externalId}`, postId, workspaceId]
    );
    return mapPost(rows[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "social_publish_failed";
    await query(
      `UPDATE marketing_content_posts
       SET publish_error = $1, updated_at = now()
       WHERE id = $2 AND workspace_id = $3`,
      [message.slice(0, 500), postId, workspaceId]
    );
    return { error: message };
  }
}
