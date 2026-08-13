import bcrypt from "bcryptjs";
import { pool } from "./db";

async function run(): Promise<void> {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS workspaces (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      city TEXT,
      inquiry_reason TEXT,
      client_type TEXT,
      category TEXT,
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      external_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      contact_id UUID NOT NULL REFERENCES contacts(id),
      assigned_manager_id UUID REFERENCES users(id),
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id UUID NOT NULL REFERENCES conversations(id),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
      body TEXT NOT NULL,
      author_user_id UUID REFERENCES users(id),
      external_message_id TEXT,
      attachment_url TEXT,
      attachment_type TEXT,
      attachment_name TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS deals (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      conversation_id UUID UNIQUE NOT NULL REFERENCES conversations(id),
      owner_user_id UUID REFERENCES users(id),
      stage TEXT NOT NULL DEFAULT 'new',
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      next_step_at TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      outcome TEXT NOT NULL DEFAULT 'open' CHECK (outcome IN ('open', 'won', 'lost')),
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      user_id UUID REFERENCES users(id),
      conversation_id UUID REFERENCES conversations(id),
      action TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS activities (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      user_id UUID REFERENCES users(id),
      conversation_id UUID REFERENCES conversations(id),
      action TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS managers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      first_response_target_minutes INTEGER NOT NULL DEFAULT 15,
      close_rate_target NUMERIC(5,2),
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

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
    );

    CREATE TABLE IF NOT EXISTS metric_snapshots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      manager_user_id UUID REFERENCES users(id),
      metric_key TEXT NOT NULL,
      metric_value NUMERIC(14,2) NOT NULL DEFAULT 0,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS message_scripts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      title TEXT NOT NULL,
      category TEXT,
      body TEXT NOT NULL,
      created_by_user_id UUID REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS knowledge_articles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      category TEXT,
      summary TEXT,
      created_by_user_id UUID REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );

    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS external_id TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS inquiry_reason TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS client_type TEXT;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
    ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_response_due_at TIMESTAMP;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_message_id TEXT;
    ALTER TABLE deals ADD COLUMN IF NOT EXISTS expected_close_at TIMESTAMP;
    ALTER TABLE message_scripts ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS summary TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
  `);

  // После CREATE TABLE users — отдельно (надёжнее, чем один многострочный скрипт).
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS login TEXT`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_lower ON users (lower(login))
      WHERE login IS NOT NULL AND trim(login) <> ''
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_stages_workspace_name_lower
      ON pipeline_stages (workspace_id, lower(name))
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

  const existingWorkspace = await pool.query<{ id: string }>(
    "SELECT id FROM workspaces WHERE name = 'Demo Workspace' LIMIT 1"
  );
  const workspaceId =
    existingWorkspace.rows[0]?.id ??
    (
      await pool.query<{ id: string }>(
        "INSERT INTO workspaces (name) VALUES ('Demo Workspace') RETURNING id"
      )
    ).rows[0].id;

  const passwordHash = await bcrypt.hash("demo123", 10);

  await pool.query(
    `INSERT INTO users (workspace_id, full_name, email, role, password_hash, login)
     VALUES ($1, 'Администратор', 'admin@demo.local', 'admin', $2, 'admin')
     ON CONFLICT (email) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         full_name = EXCLUDED.full_name,
         login = EXCLUDED.login`,
    [workspaceId, passwordHash]
  );

  await pool.query(
    `INSERT INTO users (workspace_id, full_name, email, role, password_hash, login)
     VALUES ($1, 'Оператор линии', 'manager@demo.local', 'manager', $2, 'operator')
     ON CONFLICT (email) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         full_name = EXCLUDED.full_name,
         login = EXCLUDED.login`,
    [workspaceId, passwordHash]
  );

  await pool.query(
    `UPDATE users SET login = 'admin', password_hash = $1 WHERE email = 'admin@demo.local'`,
    [passwordHash]
  );
  await pool.query(
    `UPDATE users SET login = 'operator', password_hash = $1 WHERE email = 'manager@demo.local'`,
    [passwordHash]
  );

  const manager = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE email = 'manager@demo.local' LIMIT 1"
  );

  await pool.query(
    `INSERT INTO managers (workspace_id, user_id, display_name, first_response_target_minutes, close_rate_target)
     VALUES ($1, $2, 'Оператор линии', 15, 35)
     ON CONFLICT (user_id) DO UPDATE
     SET display_name = EXCLUDED.display_name,
         first_response_target_minutes = EXCLUDED.first_response_target_minutes,
         close_rate_target = EXCLUDED.close_rate_target`,
    [workspaceId, manager.rows[0].id]
  );

  const existingContact = await pool.query<{ id: string }>(
    "SELECT id FROM contacts WHERE workspace_id = $1 AND phone = '+77000000001' LIMIT 1",
    [workspaceId]
  );
  const contactId =
    existingContact.rows[0]?.id ??
    (
      await pool.query<{ id: string }>(
        `INSERT INTO contacts (workspace_id, name, phone, city, inquiry_reason, client_type, category)
         VALUES ($1, 'ИП Ромашка', '+77000000001', 'Алматы', 'Настройка CRM', 'лид', 'b2b')
         RETURNING id`,
        [workspaceId]
      )
    ).rows[0].id;

  await pool.query(
    `UPDATE contacts
     SET name = 'ИП Ромашка',
         city = 'Алматы',
         inquiry_reason = 'Настройка CRM',
         client_type = 'лид',
         category = 'b2b'
     WHERE id = $1`,
    [contactId]
  );

  const existingConversation = await pool.query<{ id: string }>(
    "SELECT id FROM conversations WHERE workspace_id = $1 AND contact_id = $2 LIMIT 1",
    [workspaceId, contactId]
  );
  const conversationId =
    existingConversation.rows[0]?.id ??
    (
      await pool.query<{ id: string }>(
        `INSERT INTO conversations (workspace_id, contact_id, assigned_manager_id, channel)
         VALUES ($1, $2, $3, 'whatsapp')
         RETURNING id`,
        [workspaceId, contactId, manager.rows[0].id]
      )
    ).rows[0].id;

  await pool.query(
    `INSERT INTO messages (conversation_id, workspace_id, direction, body)
     SELECT $1, $2, 'incoming', 'Здравствуйте! Интересуют подробности по внедрению CRM.'
     WHERE NOT EXISTS (
       SELECT 1 FROM messages
       WHERE conversation_id = $1 AND direction = 'incoming'
     )`,
    [conversationId, workspaceId]
  );

  await pool.query(
    `UPDATE messages
     SET body = 'Здравствуйте! Интересуют подробности по внедрению CRM.'
     WHERE conversation_id = $1
       AND direction = 'incoming'
       AND body = 'Hello, interested in CRM implementation details'`,
    [conversationId]
  );

  await pool.query(
    `INSERT INTO deals (workspace_id, conversation_id, owner_user_id, stage, amount)
     VALUES ($1, $2, $3, 'qualified', 250000)
     ON CONFLICT (conversation_id) DO UPDATE
     SET owner_user_id = EXCLUDED.owner_user_id,
         stage = EXCLUDED.stage,
         amount = EXCLUDED.amount,
         updated_at = now()`,
    [workspaceId, conversationId, manager.rows[0].id]
  );

  const existingDeal = await pool.query<{ id: string }>(
    `SELECT id FROM deals WHERE workspace_id = $1 AND conversation_id = $2 LIMIT 1`,
    [workspaceId, conversationId]
  );
  const dealId = existingDeal.rows[0]?.id;

  if (dealId) {
    await pool.query(
      `INSERT INTO tasks (workspace_id, conversation_id, deal_id, owner_user_id, title, status, due_at)
       SELECT $1, $2, $3, $4, $5, 'open', now() + interval '1 day'
       WHERE NOT EXISTS (
         SELECT 1 FROM tasks
         WHERE workspace_id = $1 AND deal_id = $3 AND title = $5
       )`,
      [workspaceId, conversationId, dealId, manager.rows[0].id, "Подготовить коммерческое предложение"]
    );
  }

  const defaultStages = [
    { name: "new", position: 10, outcome: "open" },
    { name: "qualified", position: 20, outcome: "open" },
    { name: "proposal", position: 30, outcome: "open" },
    { name: "won", position: 40, outcome: "won" },
    { name: "lost", position: 50, outcome: "lost" }
  ];
  for (const stage of defaultStages) {
    await pool.query(
      `INSERT INTO pipeline_stages (workspace_id, name, position, outcome)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (
         SELECT 1
         FROM pipeline_stages
         WHERE workspace_id = $1 AND lower(name) = lower($2)
       )`,
      [workspaceId, stage.name, stage.position, stage.outcome]
    );
  }

  await pool.query(
    `UPDATE message_scripts
     SET title = 'Первый ответ',
         category = 'Первичный контакт',
         body = 'Здравствуйте! Спасибо за ваше сообщение. Я изучу ваш запрос и скоро вернусь с дальнейшими шагами.'
     WHERE workspace_id = $1 AND title = 'First response'`,
    [workspaceId]
  );

  await pool.query(
    `UPDATE message_scripts
     SET title = 'Уточнение по стоимости',
         category = 'Продажи',
         body = 'Мы подготовим для вас подходящий вариант. Подскажите, пожалуйста, размер команды и задачи, и я отправлю лучшее предложение.'
     WHERE workspace_id = $1 AND title = 'Pricing follow-up'`,
    [workspaceId]
  );

  await pool.query(
    `INSERT INTO message_scripts (workspace_id, title, category, body, created_by_user_id)
     SELECT $1, $2, $3, $4, $5
     WHERE NOT EXISTS (
       SELECT 1 FROM message_scripts
       WHERE workspace_id = $1 AND title = $2
     )`,
    [
      workspaceId,
      "Первый ответ",
      "Первичный контакт",
      "Здравствуйте! Спасибо за ваше сообщение. Я изучу ваш запрос и скоро вернусь с дальнейшими шагами.",
      manager.rows[0].id
    ]
  );

  await pool.query(
    `INSERT INTO activities (workspace_id, user_id, conversation_id, action, metadata)
     VALUES ($1, $2, $3, 'seed_initialized', $4::jsonb)
     ON CONFLICT DO NOTHING`,
    [workspaceId, manager.rows[0].id, conversationId, JSON.stringify({ source: "seed" })]
  );

  await pool.query(
    `INSERT INTO metric_snapshots (workspace_id, manager_user_id, metric_key, metric_value, period_start, period_end)
     VALUES ($1, $2, 'first_response_minutes', 12, current_date - 6, current_date)
     ON CONFLICT (workspace_id, COALESCE(manager_user_id, '00000000-0000-0000-0000-000000000000'::uuid), metric_key, period_start, period_end)
     DO UPDATE SET metric_value = EXCLUDED.metric_value`,
    [workspaceId, manager.rows[0].id]
  );

  await pool.query(
    `INSERT INTO knowledge_articles (workspace_id, title, url, category, summary, created_by_user_id)
     SELECT $1, $2, $3, $4, $5, $6
     WHERE NOT EXISTS (
       SELECT 1 FROM knowledge_articles
       WHERE workspace_id = $1 AND title = $2
     )`,
    [
      workspaceId,
      "Инструкция: подключение Telegram",
      "https://core.telegram.org/bots#how-do-i-create-a-bot",
      "Интеграции",
      "Шаги по созданию и первичной настройке Telegram-бота.",
      manager.rows[0].id
    ]
  );

  await pool.query(
    `INSERT INTO knowledge_articles (workspace_id, title, url, category, summary, created_by_user_id)
     SELECT $1, $2, $3, $4, $5, $6
     WHERE NOT EXISTS (
       SELECT 1 FROM knowledge_articles
       WHERE workspace_id = $1 AND title = $2
     )`,
    [
      workspaceId,
      "Как быстро обработать новый лид",
      "https://example.com/light-crm/lead-playbook",
      "Продажи",
      "Короткий playbook для первой реакции и квалификации обращения.",
      manager.rows[0].id
    ]
  );

  await pool.query(
    `INSERT INTO message_scripts (workspace_id, title, category, body, created_by_user_id)
     SELECT $1, $2, $3, $4, $5
     WHERE NOT EXISTS (
       SELECT 1 FROM message_scripts
       WHERE workspace_id = $1 AND title = $2
     )`,
    [
      workspaceId,
      "Уточнение по стоимости",
      "Продажи",
      "Мы подготовим для вас подходящий вариант. Подскажите, пожалуйста, размер команды и задачи, и я отправлю лучшее предложение.",
      manager.rows[0].id
    ]
  );

  const { ensureDemoLandingWebChat } = await import("./modules/integrations/webchat/credentials");
  await ensureDemoLandingWebChat();

  console.log("Seed complete");
  await pool.end();
}

run().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
