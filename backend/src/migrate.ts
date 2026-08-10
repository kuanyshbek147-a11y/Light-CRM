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
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_stages_workspace_name_lower
      ON pipeline_stages (workspace_id, lower(name))
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

  await ensureSuperAdminSchema();
  await ensureSuperAdminUser();
}

export async function ensureSuperAdminSchema(): Promise<void> {
  await pool.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT now()`);
  await pool.query(`ALTER TABLE users ALTER COLUMN workspace_id DROP NOT NULL`);
  await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await pool.query(
    `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'manager', 'superadmin'))`
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
