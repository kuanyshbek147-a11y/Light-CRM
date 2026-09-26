import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { query } from "./db";
import { authMiddleware, type AuthRequest } from "./auth";
import type { UserRole } from "./auth";
import { isEmailTakenError, REGISTER_COPY, validateRegisterBody } from "./modules/auth/register";
import { createWorkspaceWithAdmin } from "./modules/platform/provision";
import { LoginThrottle } from "./modules/auth/loginThrottle";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export const authRouter = Router();

const loginThrottle = new LoginThrottle();

function signSessionToken(user: { id: string; workspace_id: string | null; role: UserRole }): string {
  return jwt.sign(
    {
      id: user.id,
      workspaceId: user.workspace_id,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

authRouter.post("/register", async (req, res) => {
  const parsed = validateRegisterBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error, field: parsed.field });
    return;
  }

  const { email, password, workspaceName, fullName, login } = parsed.value;

  try {
    const existing = await query<{ id: string }>(
      `SELECT id FROM users
       WHERE LOWER(TRIM(email)) = $1
          OR (login IS NOT NULL AND LOWER(TRIM(login)) = $1)
       LIMIT 1`,
      [email]
    );
    if (existing[0]) {
      res.status(409).json({ error: REGISTER_COPY.emailTaken, field: "email" });
      return;
    }

    const created = await createWorkspaceWithAdmin({
      name: workspaceName,
      admin: {
        fullName,
        email,
        login,
        password,
        role: "admin"
      }
    });

    const users = await query<{
      id: string;
      workspace_id: string | null;
      full_name: string;
      email: string;
      role: UserRole;
      login: string | null;
      color: string | null;
    }>(
      `SELECT id, workspace_id, full_name, email, role, login, color
       FROM users
       WHERE id = $1 AND is_active = true
       LIMIT 1`,
      [created.adminUserId]
    );
    const user = users[0];
    if (!user) {
      res.status(500).json({ error: REGISTER_COPY.failed });
      return;
    }

    const token = signSessionToken(user);
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        login: user.login,
        color: user.color
      }
    });
  } catch (error) {
    if (isEmailTakenError(error)) {
      res.status(409).json({ error: REGISTER_COPY.emailTaken, field: "email" });
      return;
    }
    console.error("Register failed:", error);
    res.status(500).json({ error: REGISTER_COPY.failed });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
  const body = req.body as { login?: string; email?: string; password?: string };
  const password = typeof body.password === "string" ? body.password : "";
  const raw =
    typeof body.login === "string" && body.login.trim()
      ? body.login
      : typeof body.email === "string"
        ? body.email
        : "";
  const identifier = raw.trim().toLowerCase();

  if (!identifier || !password) {
    res.status(400).json({ error: "Укажите логин и пароль" });
    return;
  }

  const clientIp = req.ip || "unknown";
  const waitSeconds = loginThrottle.retryAfterSeconds(clientIp, identifier);
  if (waitSeconds > 0) {
    res.setHeader("Retry-After", String(waitSeconds));
    res.status(429).json({
      error: `Слишком много неудачных попыток. Попробуйте через ${Math.ceil(waitSeconds / 60)} мин.`
    });
    return;
  }

  const users = await query<{
    id: string;
    workspace_id: string | null;
    full_name: string;
    email: string;
    role: UserRole;
    password_hash: string;
    login: string | null;
    is_active: boolean;
    color: string | null;
  }>(
    `SELECT id, workspace_id, full_name, email, role, password_hash, login, is_active, color
     FROM users
     WHERE is_active = true
       AND (
         LOWER(TRIM(email)) = $1
         OR (login IS NOT NULL AND LOWER(TRIM(login)) = $1)
         OR (
           POSITION('@' IN email) > 0
           AND LOWER(SPLIT_PART(email, '@', 1)) = $1
         )
         OR ($1 = 'operator' AND LOWER(TRIM(email)) = 'manager@demo.local')
       )
     ORDER BY
       CASE
         WHEN login IS NOT NULL AND LOWER(TRIM(login)) = $1 THEN 0
         WHEN LOWER(TRIM(email)) = $1 THEN 1
         WHEN $1 = 'operator' AND LOWER(TRIM(email)) = 'manager@demo.local' THEN 2
         ELSE 3
       END
     LIMIT 1`,
    [identifier]
  );

  const user = users[0];
  if (!user) {
    loginThrottle.recordFailure(clientIp, identifier);
    res.status(401).json({ error: "Неверный логин или пароль" });
    return;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    loginThrottle.recordFailure(clientIp, identifier);
    res.status(401).json({ error: "Неверный логин или пароль" });
    return;
  }
  loginThrottle.recordSuccess(clientIp, identifier);

  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);

  const token = signSessionToken(user);

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      login: user.login,
      color: user.color
    }
  });
  } catch (error) {
    console.error("Login failed:", error);
    res.status(503).json({ error: "База данных временно недоступна. Попробуйте через минуту." });
  }
});

authRouter.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    const payload = jwt.verify(token, JWT_SECRET) as { id: string };
    const users = await query<{
      id: string;
      email: string;
      full_name: string;
      role: UserRole;
      login: string | null;
      color: string | null;
    }>(
      `SELECT id, email, full_name, role, login, color
       FROM users
       WHERE id = $1 AND is_active = true
       LIMIT 1`,
      [payload.id]
    );
    const user = users[0];
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        login: user.login,
        color: user.color
      }
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

authRouter.post("/change-password", authMiddleware, async (req: AuthRequest, res) => {
  const body = req.body as { currentPassword?: string; newPassword?: string };
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!currentPassword || newPassword.length < 10) {
    res.status(400).json({ error: "Текущий пароль обязателен. Новый — минимум 10 символов." });
    return;
  }

  const users = await query<{ id: string; password_hash: string }>(
    `SELECT id, password_hash FROM users WHERE id = $1 AND is_active = true LIMIT 1`,
    [req.user.id]
  );
  const user = users[0];
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const isValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isValid) {
    res.status(400).json({ error: "Неверный текущий пароль" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [user.id, passwordHash]);

  res.json({ ok: true });
});
