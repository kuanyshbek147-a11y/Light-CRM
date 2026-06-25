import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { query } from "./db";
import type { UserRole } from "./auth";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
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

  const users = await query<{
    id: string;
    workspace_id: string | null;
    full_name: string;
    email: string;
    role: UserRole;
    password_hash: string;
    login: string | null;
    is_active: boolean;
  }>(
    `SELECT id, workspace_id, full_name, email, role, password_hash, login, is_active
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
       )`,
    [identifier]
  );

  const user = users[0];
  if (!user) {
    res.status(401).json({ error: "Неверный логин или пароль" });
    return;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    res.status(401).json({ error: "Неверный логин или пароль" });
    return;
  }

  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);

  const token = jwt.sign(
    {
      id: user.id,
      workspaceId: user.workspace_id,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      login: user.login
    }
  });
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
    }>(
      `SELECT id, email, full_name, role, login
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
        login: user.login
      }
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});
