import { pool } from "./db";

/** Гарантирует колонку login и индекс (старые БД без полного прогона сида). */
export async function ensureUserLoginSchema(): Promise<void> {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS login TEXT`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_lower ON users (lower(login))
      WHERE login IS NOT NULL AND trim(login) <> ''
  `);
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
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type TEXT`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT`);
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
}
