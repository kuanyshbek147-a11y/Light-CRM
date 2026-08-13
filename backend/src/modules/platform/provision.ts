import bcrypt from "bcryptjs";
import { query } from "../../db";

const DEFAULT_PIPELINE_STAGES = [
  { name: "new", position: 10, outcome: "open" },
  { name: "qualified", position: 20, outcome: "open" },
  { name: "proposal", position: 30, outcome: "open" },
  { name: "won", position: 40, outcome: "won" },
  { name: "lost", position: 50, outcome: "lost" }
] as const;

export type WorkspaceUserInput = {
  fullName: string;
  email: string;
  login: string;
  password: string;
  role: "admin" | "manager" | "marketer";
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

async function assertUniqueUser(email: string, login: string): Promise<void> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM users
     WHERE LOWER(TRIM(email)) = $1
        OR (login IS NOT NULL AND LOWER(TRIM(login)) = $2)
     LIMIT 1`,
    [normalizeEmail(email), normalizeLogin(login)]
  );
  if (existing[0]) {
    throw new Error("Пользователь с таким email или логином уже существует");
  }
}

async function seedWorkspaceDefaults(workspaceId: string): Promise<void> {
  for (const stage of DEFAULT_PIPELINE_STAGES) {
    await query(
      `INSERT INTO pipeline_stages (workspace_id, name, position, outcome)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM pipeline_stages
         WHERE workspace_id = $1 AND lower(name) = lower($2)
       )`,
      [workspaceId, stage.name, stage.position, stage.outcome]
    );
  }

  await query(
    `INSERT INTO message_scripts (workspace_id, title, category, body)
     SELECT $1, $2, $3, $4
     WHERE NOT EXISTS (
       SELECT 1 FROM message_scripts WHERE workspace_id = $1 AND title = $2
     )`,
    [
      workspaceId,
      "Первый ответ",
      "Первичный контакт",
      "Здравствуйте! Спасибо за ваше сообщение. Я изучу ваш запрос и скоро вернусь с дальнейшими шагами."
    ]
  );
}

export async function createWorkspaceUser(
  workspaceId: string,
  input: WorkspaceUserInput
): Promise<{ userId: string }> {
  const fullName = input.fullName.trim();
  const email = normalizeEmail(input.email);
  const login = normalizeLogin(input.login);
  const password = input.password;

  if (!fullName || !email || !login || password.length < 6) {
    throw new Error("Заполните все поля. Пароль — минимум 6 символов");
  }
  if (input.role !== "admin" && input.role !== "manager") {
    throw new Error("Роль должна быть admin или manager");
  }

  const workspace = await query<{ id: string }>(
    `SELECT id FROM workspaces WHERE id = $1 LIMIT 1`,
    [workspaceId]
  );
  if (!workspace[0]) {
    throw new Error("Компания не найдена");
  }

  await assertUniqueUser(email, login);
  const passwordHash = await bcrypt.hash(password, 10);

  const rows = await query<{ id: string }>(
    `INSERT INTO users (workspace_id, full_name, email, login, role, password_hash, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     RETURNING id`,
    [workspaceId, fullName, email, login, input.role, passwordHash]
  );
  const userId = rows[0]?.id;
  if (!userId) {
    throw new Error("Не удалось создать пользователя");
  }

  if (input.role === "manager") {
    await query(
      `INSERT INTO managers (workspace_id, user_id, display_name, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (user_id) DO UPDATE
       SET display_name = EXCLUDED.display_name, is_active = true`,
      [workspaceId, userId, fullName]
    );
  }

  return { userId };
}

export async function createWorkspaceWithAdmin(input: {
  name: string;
  admin: WorkspaceUserInput;
}): Promise<{ workspaceId: string; adminUserId: string }> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Укажите название компании");
  }
  if (input.admin.role !== "admin") {
    throw new Error("Первый пользователь компании должен быть admin");
  }

  const workspaceRows = await query<{ id: string }>(
    `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
    [name]
  );
  const workspaceId = workspaceRows[0]?.id;
  if (!workspaceId) {
    throw new Error("Не удалось создать компанию");
  }

  await seedWorkspaceDefaults(workspaceId);
  const { userId: adminUserId } = await createWorkspaceUser(workspaceId, input.admin);

  return { workspaceId, adminUserId };
}
