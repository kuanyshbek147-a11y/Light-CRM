import { query } from "../../db";
import { createCampaignFromPost, type MarketingContentPost } from "./posts";
import { publishPostToSocial } from "./social";

let schedulerTimer: NodeJS.Timeout | null = null;
let tickRunning = false;

type DuePost = MarketingContentPost & {
  workspace_id: string;
  created_by_user_id: string | null;
};

async function claimDuePosts(limit = 10): Promise<DuePost[]> {
  const rows = await query<DuePost>(
    `UPDATE marketing_content_posts
     SET schedule_processed_at = now(),
         updated_at = now()
     WHERE id IN (
       SELECT id
       FROM marketing_content_posts
       WHERE status = 'ready'
         AND planned_at IS NOT NULL
         AND planned_at <= now()
         AND schedule_processed_at IS NULL
         AND (auto_broadcast = true OR auto_publish_social = true)
       ORDER BY planned_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, workspace_id, title, body, channel, status, planned_at, published_at,
               campaign_id, segment_id, auto_broadcast, auto_publish_social, image_url,
               social_external_id, publish_error, schedule_processed_at, created_at, updated_at,
               created_by_user_id`,
    [limit]
  );
  return rows.map((row) => ({
    ...row,
    auto_broadcast: Boolean(row.auto_broadcast),
    auto_publish_social: Boolean(row.auto_publish_social)
  }));
}

async function setPostError(postId: string, workspaceId: string, error: string): Promise<void> {
  await query(
    `UPDATE marketing_content_posts
     SET publish_error = $1, updated_at = now()
     WHERE id = $2 AND workspace_id = $3`,
    [error.slice(0, 500), postId, workspaceId]
  );
}

async function markPublished(postId: string, workspaceId: string, socialExternalId?: string): Promise<void> {
  await query(
    `UPDATE marketing_content_posts
     SET status = 'published',
         published_at = COALESCE(published_at, now()),
         social_external_id = COALESCE($1, social_external_id),
         publish_error = NULL,
         updated_at = now()
     WHERE id = $2 AND workspace_id = $3`,
    [socialExternalId || null, postId, workspaceId]
  );
}

async function processDuePost(post: DuePost): Promise<void> {
  const errors: string[] = [];
  let socialOk = false;
  let broadcastQueued = false;

  if (post.auto_publish_social) {
    try {
      const result = await publishPostToSocial({
        workspaceId: post.workspace_id,
        channel: post.channel,
        title: post.title,
        body: post.body,
        imageUrl: post.image_url
      });
      socialOk = true;
      await query(
        `UPDATE marketing_content_posts
         SET social_external_id = $1, updated_at = now()
         WHERE id = $2`,
        [`${result.target}:${result.externalId}`, post.id]
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "social_publish_failed");
    }
  }

  if (post.auto_broadcast) {
    const segmentId = (post.segment_id || "").trim();
    if (!segmentId) {
      errors.push("Для авторассылки нужен сегмент");
    } else if (post.channel !== "whatsapp" && post.channel !== "telegram") {
      errors.push("Авторассылка только для WhatsApp/Telegram");
    } else {
      let userId = post.created_by_user_id || "";
      if (!userId) {
        const admin = await query<{ id: string }>(
          `SELECT id FROM users
           WHERE workspace_id = $1 AND is_active = true
           ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at ASC
           LIMIT 1`,
          [post.workspace_id]
        );
        userId = admin[0]?.id || "";
      }
      if (!userId) {
        errors.push("Нет пользователя для авторассылки");
      } else {
        const result = await createCampaignFromPost({
          workspaceId: post.workspace_id,
          userId,
          postId: post.id,
          segmentId,
          channel: post.channel,
          start: true
        });
        if ("error" in result) {
          errors.push(result.error);
        } else {
          broadcastQueued = true;
        }
      }
    }
  }

  if (errors.length) {
    await setPostError(post.id, post.workspace_id, errors.join("; "));
  }

  // Social-only success → published now. Broadcast → published when campaign finishes.
  if (socialOk && !post.auto_broadcast) {
    await markPublished(post.id, post.workspace_id);
  } else if (socialOk && post.auto_broadcast && !broadcastQueued) {
    await markPublished(post.id, post.workspace_id);
  } else if (!post.auto_broadcast && !post.auto_publish_social) {
    await markPublished(post.id, post.workspace_id);
  }
}

export async function processDueContentPosts(): Promise<number> {
  if (tickRunning) {
    return 0;
  }
  tickRunning = true;
  try {
    const due = await claimDuePosts(10);
    for (const post of due) {
      try {
        await processDuePost(post);
      } catch (error) {
        console.error("Content schedule failed", post.id, error);
        await setPostError(
          post.id,
          post.workspace_id,
          error instanceof Error ? error.message : "schedule_failed"
        );
      }
    }
    return due.length;
  } finally {
    tickRunning = false;
  }
}

export function startContentScheduler(): void {
  if (schedulerTimer) {
    return;
  }
  schedulerTimer = setInterval(() => {
    void processDueContentPosts();
  }, 60_000);
  setTimeout(() => {
    void processDueContentPosts();
  }, 20_000);
}
