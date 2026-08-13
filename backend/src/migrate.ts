import { pool } from "./db";
import bcrypt from "bcryptjs";
import { isLegacyKnowledgeSlug, slugifyKnowledgeTitle } from "./modules/knowledge/slug";
import { ensureDemoLandingWebChat } from "./modules/integrations/webchat/credentials";

async function backfillReadableKnowledgeSlugs(): Promise<void> {
  const result = await pool.query<{ id: string; title: string; public_slug: string | null }>(
    `SELECT id, title, public_slug FROM knowledge_articles ORDER BY created_at ASC`
  );
  const used = new Set(
    result.rows
      .map((row) => (row.public_slug || "").trim())
      .filter((slug) => slug && !isLegacyKnowledgeSlug(slug))
  );

  for (const row of result.rows) {
    const current = (row.public_slug || "").trim();
    if (current && !isLegacyKnowledgeSlug(current)) {
      continue;
    }

    const base = slugifyKnowledgeTitle(row.title || "instrukciya");
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) {
      candidate = `${base.slice(0, 56)}-${n}`;
      n += 1;
    }
    used.add(candidate);
    await pool.query(`UPDATE knowledge_articles SET public_slug = $1 WHERE id = $2`, [candidate, row.id]);
  }
}

/** Гарантирует колонку login и индекс (старые БД без полного прогона сида). */
export async function ensureUserLoginSchema(): Promise<void> {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS managers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_assigned_at TIMESTAMP,
      first_response_target_minutes INTEGER NOT NULL DEFAULT 15,
      close_rate_target NUMERIC(5,2),
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      user_id UUID REFERENCES users(id),
      conversation_id UUID REFERENCES conversations(id),
      action TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_settings (
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, key)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      conversation_id UUID REFERENCES conversations(id),
      deal_id UUID REFERENCES deals(id),
      owner_user_id UUID REFERENCES users(id),
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
      due_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS metric_snapshots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      manager_user_id UUID REFERENCES users(id),
      metric_key TEXT NOT NULL,
      metric_value NUMERIC(14,2) NOT NULL DEFAULT 0,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS login TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS color TEXT`);
  await pool.query(`ALTER TABLE managers ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMP`);

  // Stable per-operator colors for assigned dialog cards.
  await pool.query(`
    WITH palette AS (
      SELECT ARRAY[
        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
        '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'
      ]::text[] AS colors
    ),
    numbered AS (
      SELECT u.id,
             ((ROW_NUMBER() OVER (ORDER BY u.created_at ASC, u.id ASC) - 1) % 10) + 1 AS color_index
      FROM users u
      WHERE u.role IN ('manager', 'admin')
        AND (u.color IS NULL OR TRIM(u.color) = '')
    )
    UPDATE users u
    SET color = (SELECT colors[numbered.color_index] FROM palette)
    FROM numbered
    WHERE u.id = numbered.id
  `);

  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'`);
  await pool.query(
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_response_due_at TIMESTAMP`
  );

  await pool.query(`ALTER TABLE deals ADD COLUMN IF NOT EXISTS expected_close_at TIMESTAMP`);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_lower ON users (lower(login))
      WHERE login IS NOT NULL AND trim(login) <> ''
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON messages (conversation_id, created_at)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_conversations_status_assigned_updated
      ON conversations (status, assigned_manager_id, updated_at DESC)`
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_deals_stage_amount ON deals (stage, amount)`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_metric_snapshots_unique_period
      ON metric_snapshots (workspace_id, COALESCE(manager_user_id, '00000000-0000-0000-0000-000000000000'::uuid), metric_key, period_start, period_end)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status_due ON tasks (workspace_id, status, due_at)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_workspace_settings_workspace
      ON workspace_settings (workspace_id)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_managers_workspace_active_last_assigned
      ON managers (workspace_id, is_active, last_assigned_at, created_at)`
  );

  await pool.query(`
    UPDATE users SET login = 'admin'
    WHERE email = 'admin@demo.local' AND (login IS NULL OR trim(login) = '')
  `);
  await pool.query(`
    UPDATE users SET login = 'operator'
    WHERE email = 'manager@demo.local' AND (login IS NULL OR trim(login) = '')
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS knowledge_articles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      category TEXT,
      summary TEXT,
      created_by_user_id UUID REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS category TEXT`);
  await pool.query(`ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS summary TEXT`);
  await pool.query(`ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS body TEXT`);
  await pool.query(`ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS public_slug TEXT`);
  await pool.query(`ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS status TEXT`);
  await pool.query(`ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`);
  await pool.query(`ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS view_count INTEGER`);
  await pool.query(`ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`);
  await pool.query(`ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN`);
  await pool.query(`ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS is_archived BOOLEAN`);
  await pool.query(`
    UPDATE knowledge_articles
    SET status = 'published'
    WHERE status IS NULL OR trim(status) = ''
  `);
  await pool.query(`
    UPDATE knowledge_articles
    SET view_count = 0
    WHERE view_count IS NULL
  `);
  await pool.query(`
    UPDATE knowledge_articles
    SET updated_at = COALESCE(updated_at, created_at, now())
    WHERE updated_at IS NULL
  `);
  await pool.query(`
    UPDATE knowledge_articles
    SET is_pinned = false
    WHERE is_pinned IS NULL
  `);
  await pool.query(`
    UPDATE knowledge_articles
    SET is_archived = false
    WHERE is_archived IS NULL
  `);
  await pool.query(`
    ALTER TABLE knowledge_articles
      ALTER COLUMN status SET DEFAULT 'published',
      ALTER COLUMN view_count SET DEFAULT 0,
      ALTER COLUMN is_pinned SET DEFAULT false,
      ALTER COLUMN is_archived SET DEFAULT false,
      ALTER COLUMN updated_at SET DEFAULT now()
  `);
  await pool.query(`
    UPDATE knowledge_articles
    SET public_slug = substr(replace(id::text, '-', ''), 1, 16)
    WHERE public_slug IS NULL OR trim(public_slug) = ''
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_articles_public_slug
      ON knowledge_articles (public_slug)
  `);
  await backfillReadableKnowledgeSlugs();
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type TEXT`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta_media_id TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP`);
  await pool.query(`
    UPDATE contacts
    SET created_at = now()
    WHERE created_at IS NULL
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      outcome TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_stages_workspace_name_lower
      ON pipeline_stages (workspace_id, lower(name))
  `);
  await pool.query(
    `ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'open'`
  );
  await pool.query(`
    UPDATE pipeline_stages
    SET outcome = 'won'
    WHERE outcome = 'open'
      AND (
        lower(name) IN ('won', 'выиграно', 'успех', 'closed')
        OR lower(name) LIKE '%won%'
        OR lower(name) LIKE '%выиг%'
        OR lower(name) LIKE '%успех%'
      )
  `);
  await pool.query(`
    UPDATE pipeline_stages
    SET outcome = 'lost'
    WHERE outcome = 'open'
      AND (
        lower(name) IN ('lost', 'проиграно', 'отказ')
        OR lower(name) LIKE '%lost%'
        OR lower(name) LIKE '%проиг%'
        OR lower(name) LIKE '%отказ%'
      )
  `);
  await pool.query(`ALTER TABLE pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_outcome_check`);
  await pool.query(`
    ALTER TABLE pipeline_stages
    ADD CONSTRAINT pipeline_stages_outcome_check
    CHECK (outcome IN ('open', 'won', 'lost'))
  `);

  await pool.query(`
    INSERT INTO managers (workspace_id, user_id, display_name)
    SELECT u.workspace_id, u.id, u.full_name
    FROM users u
    WHERE u.role = 'manager'
      AND NOT EXISTS (
        SELECT 1 FROM managers m WHERE m.user_id = u.id
      )
  `);

  await pool.query(`
    INSERT INTO activities (workspace_id, user_id, conversation_id, action, metadata, created_at)
    SELECT workspace_id, user_id, conversation_id, action, metadata, created_at
    FROM activity_logs al
    WHERE NOT EXISTS (
      SELECT 1
      FROM activities a
      WHERE a.workspace_id = al.workspace_id
        AND a.action = al.action
        AND a.created_at = al.created_at
        AND COALESCE(a.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(al.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND COALESCE(a.conversation_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(al.conversation_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_segments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      name TEXT NOT NULL,
      filter_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by_user_id UUID REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_marketing_segments_workspace
      ON marketing_segments (workspace_id, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      segment_id UUID REFERENCES marketing_segments(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram')),
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'queued', 'sending', 'done', 'cancelled', 'failed')),
      created_by_user_id UUID REFERENCES users(id),
      started_at TIMESTAMP,
      finished_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_workspace_status
      ON marketing_campaigns (workspace_id, status, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_campaign_recipients (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      campaign_id UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      contact_id UUID NOT NULL REFERENCES contacts(id),
      conversation_id UUID REFERENCES conversations(id),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
      message_id UUID REFERENCES messages(id),
      error TEXT,
      sent_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (campaign_id, contact_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_marketing_recipients_campaign_status
      ON marketing_campaign_recipients (campaign_id, status)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_content_posts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'whatsapp'
        CHECK (channel IN ('whatsapp', 'telegram', 'instagram', 'web', 'other')),
      status TEXT NOT NULL DEFAULT 'idea'
        CHECK (status IN ('idea', 'draft', 'ready', 'published', 'cancelled')),
      planned_at TIMESTAMP,
      published_at TIMESTAMP,
      campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
      created_by_user_id UUID REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_marketing_content_posts_workspace_planned
      ON marketing_content_posts (workspace_id, planned_at ASC NULLS LAST, created_at DESC)
  `);
  await pool.query(
    `ALTER TABLE marketing_content_posts ADD COLUMN IF NOT EXISTS auto_broadcast BOOLEAN NOT NULL DEFAULT false`
  );
  await pool.query(
    `ALTER TABLE marketing_content_posts ADD COLUMN IF NOT EXISTS auto_publish_social BOOLEAN NOT NULL DEFAULT false`
  );
  await pool.query(`ALTER TABLE marketing_content_posts ADD COLUMN IF NOT EXISTS segment_id UUID`);
  await pool.query(`ALTER TABLE marketing_content_posts ADD COLUMN IF NOT EXISTS image_url TEXT`);
  await pool.query(`ALTER TABLE marketing_content_posts ADD COLUMN IF NOT EXISTS social_external_id TEXT`);
  await pool.query(`ALTER TABLE marketing_content_posts ADD COLUMN IF NOT EXISTS publish_error TEXT`);
  await pool.query(
    `ALTER TABLE marketing_content_posts ADD COLUMN IF NOT EXISTS schedule_processed_at TIMESTAMP`
  );
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_marketing_content_posts_due
      ON marketing_content_posts (planned_at)
      WHERE schedule_processed_at IS NULL AND planned_at IS NOT NULL
  `);

  await pool.query(`
    ALTER TABLE marketing_campaigns
      ADD COLUMN IF NOT EXISTS template_name TEXT
  `);
  await pool.query(`
    ALTER TABLE marketing_campaigns
      ADD COLUMN IF NOT EXISTS template_lang TEXT
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_sequences (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      name TEXT NOT NULL,
      segment_id UUID REFERENCES marketing_segments(id) ON DELETE SET NULL,
      channel TEXT NOT NULL DEFAULT 'whatsapp'
        CHECK (channel IN ('whatsapp', 'telegram')),
      step0_body TEXT NOT NULL,
      step3_body TEXT NOT NULL,
      step7_body TEXT NOT NULL,
      template_name TEXT,
      template_lang TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'paused', 'done')),
      created_by_user_id UUID REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_sequence_runs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      sequence_id UUID NOT NULL REFERENCES marketing_sequences(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      contact_id UUID NOT NULL REFERENCES contacts(id),
      conversation_id UUID REFERENCES conversations(id),
      step_index INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed', 'done', 'skipped')),
      next_run_at TIMESTAMP NOT NULL DEFAULT now(),
      last_error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (sequence_id, contact_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_marketing_sequence_runs_due
      ON marketing_sequence_runs (status, next_run_at)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ads_audiences (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      segment_id UUID REFERENCES marketing_segments(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      meta_audience_id TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'syncing', 'ready', 'failed')),
      last_error TEXT,
      last_sync_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ads_audiences_workspace
      ON ads_audiences (workspace_id, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ads_campaigns (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      audience_id UUID REFERENCES ads_audiences(id) ON DELETE SET NULL,
      content_post_id UUID,
      name TEXT NOT NULL,
      objective TEXT NOT NULL DEFAULT 'OUTCOME_TRAFFIC',
      daily_budget_cents INTEGER NOT NULL DEFAULT 1000,
      currency TEXT NOT NULL DEFAULT 'USD',
      meta_campaign_id TEXT,
      meta_adset_id TEXT,
      meta_ad_id TEXT,
      meta_creative_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_review', 'active', 'paused', 'failed')),
      last_error TEXT,
      metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by_user_id UUID REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ads_campaigns_workspace
      ON ads_campaigns (workspace_id, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_landing_pages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      brand_name TEXT NOT NULL DEFAULT '',
      headline TEXT NOT NULL DEFAULT '',
      subheadline TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      cta_label TEXT NOT NULL DEFAULT 'Написать в WhatsApp',
      cta_url TEXT,
      phone TEXT,
      hero_image_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published')),
      view_count INTEGER NOT NULL DEFAULT 0,
      created_by_user_id UUID REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (slug)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_marketing_landing_pages_workspace
      ON marketing_landing_pages (workspace_id, updated_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_marketing_landing_pages_status
      ON marketing_landing_pages (status, slug)
  `);
  await pool.query(
    `ALTER TABLE marketing_landing_pages ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0`
  );
  await pool.query(
    `ALTER TABLE marketing_landing_pages ADD COLUMN IF NOT EXISTS cta_prefill TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_landing_clicks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      landing_id UUID NOT NULL REFERENCES marketing_landing_pages(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_content TEXT,
      user_agent TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_marketing_landing_clicks_landing
      ON marketing_landing_clicks (landing_id, created_at DESC)
  `);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS marketing_source TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_source TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_medium TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_campaign TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS utm_content TEXT`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS landing_id UUID`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_threads (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      kind TEXT NOT NULL CHECK (kind IN ('channel', 'dm')),
      title TEXT NOT NULL DEFAULT '',
      dm_key TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_threads_channel_one
      ON staff_threads (workspace_id)
      WHERE kind = 'channel'
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_threads_dm_key
      ON staff_threads (workspace_id, dm_key)
      WHERE kind = 'dm' AND dm_key IS NOT NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_threads_workspace_updated
      ON staff_threads (workspace_id, updated_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_thread_members (
      thread_id UUID NOT NULL REFERENCES staff_threads(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_at TIMESTAMP,
      joined_at TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY (thread_id, user_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_thread_members_user
      ON staff_thread_members (user_id, thread_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      thread_id UUID NOT NULL REFERENCES staff_threads(id) ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      author_user_id UUID REFERENCES users(id),
      body TEXT NOT NULL,
      task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
      conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
      is_system BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_staff_messages_thread_created
      ON staff_messages (thread_id, created_at ASC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS telephony_extensions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sip_username TEXT NOT NULL,
      sip_password_enc TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, user_id),
      UNIQUE (workspace_id, sip_username)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_telephony_extensions_workspace
      ON telephony_extensions (workspace_id, is_active)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS call_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
      contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      remote_number TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'started'
        CHECK (status IN ('ringing', 'started', 'answered', 'ended', 'missed', 'failed')),
      started_at TIMESTAMP NOT NULL DEFAULT now(),
      ended_at TIMESTAMP,
      duration_sec INTEGER,
      sip_call_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_call_logs_workspace_started
      ON call_logs (workspace_id, started_at DESC)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_call_logs_sip_call_id
      ON call_logs (workspace_id, sip_call_id)
      WHERE sip_call_id IS NOT NULL AND sip_call_id <> ''
  `);

  await ensureSuperAdminSchema();
  await ensureSuperAdminUser();
}

export async function ensureSuperAdminSchema(): Promise<void> {
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now()`);
  await pool.query(`ALTER TABLE users ALTER COLUMN workspace_id DROP NOT NULL`);
  await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await pool.query(
    `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'manager', 'marketer', 'superadmin'))`
  );
}

export async function ensureSuperAdminUser(): Promise<void> {
  const login = (process.env.SUPER_ADMIN_LOGIN || "superadmin").trim().toLowerCase();
  const email = (process.env.SUPER_ADMIN_EMAIL || "platform@lightcrm.local").trim().toLowerCase();
  const passwordFromEnv = process.env.SUPER_ADMIN_PASSWORD?.trim() || "";
  const password = passwordFromEnv || "superadmin123";
  const fullName = process.env.SUPER_ADMIN_NAME || "Супер-админ Light CRM";

  if (!login) {
    return;
  }

  const existing = await pool.query<{ id: string; role: string }>(
    `SELECT id, role FROM users
     WHERE role = 'superadmin'
        OR LOWER(TRIM(login)) = $1
        OR LOWER(TRIM(email)) = $2
     LIMIT 1`,
    [login, email]
  );

  if (existing.rows[0]) {
    if (passwordFromEnv) {
      const passwordHash = await bcrypt.hash(passwordFromEnv, 10);
      await pool.query(
        `UPDATE users
         SET full_name = $2,
             email = $3,
             login = $4,
             role = 'superadmin',
             workspace_id = NULL,
             password_hash = $5,
             is_active = true
         WHERE id = $1`,
        [existing.rows[0].id, fullName, email, login, passwordHash]
      );
    } else {
      await pool.query(
        `UPDATE users
         SET full_name = $2,
             email = $3,
             login = $4,
             role = 'superadmin',
             workspace_id = NULL,
             is_active = true
         WHERE id = $1`,
        [existing.rows[0].id, fullName, email, login]
      );
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (workspace_id, full_name, email, login, role, password_hash, is_active)
     VALUES (NULL, $1, $2, $3, 'superadmin', $4, true)`,
    [fullName, email, login, passwordHash]
  );
}

export async function ensureDemoIntegrations(): Promise<void> {
  try {
    await ensureDemoLandingWebChat();
  } catch (error) {
    console.error("Failed to ensure demo landing webchat:", error);
  }
}
