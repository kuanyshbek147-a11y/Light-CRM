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
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_message_id TEXT;
    ALTER TABLE message_scripts ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS summary TEXT;
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

  const defaultStages = [
    { name: "new", position: 10 },
    { name: "qualified", position: 20 },
    { name: "proposal", position: 30 },
    { name: "won", position: 40 },
    { name: "lost", position: 50 }
  ];
  for (const stage of defaultStages) {
    await pool.query(
      `INSERT INTO pipeline_stages (workspace_id, name, position)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (
         SELECT 1
         FROM pipeline_stages
         WHERE workspace_id = $1 AND lower(name) = lower($2)
       )`,
      [workspaceId, stage.name, stage.position]
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

  console.log("Seed complete");
  await pool.end();
}

run().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
