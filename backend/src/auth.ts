import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { query } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export type UserRole = "admin" | "manager" | "marketer" | "superadmin";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    workspaceId: string | null;
    role: UserRole;
  };
}

// Токен живёт 12 часов, поэтому отдельно проверяем, что пользователь не отключён:
// уволенный сотрудник должен терять доступ сразу. Ответ кэшируем ненадолго, чтобы не ходить в базу на каждый запрос.
const ACTIVE_CACHE_TTL_MS = 30_000;
const activeUserCache = new Map<string, { active: boolean; expiresAt: number }>();

export function forgetUserActiveState(userId: string): void {
  activeUserCache.delete(userId);
}

async function isUserActive(userId: string): Promise<boolean> {
  const cached = activeUserCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.active;
  }
  const rows = await query<{ is_active: boolean }>(`SELECT is_active FROM users WHERE id = $1 LIMIT 1`, [userId]);
  const active = Boolean(rows[0]?.is_active);
  activeUserCache.set(userId, { active, expiresAt: Date.now() + ACTIVE_CACHE_TTL_MS });
  return active;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let payload: AuthRequest["user"];
  try {
    const token = authHeader.replace("Bearer ", "");
    payload = jwt.verify(token, JWT_SECRET) as AuthRequest["user"];
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  if (!payload?.id) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  isUserActive(payload.id)
    .then((active) => {
      if (!active) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      req.user = payload;
      next();
    })
    .catch((error) => {
      console.error("Auth active check failed:", error);
      res.status(503).json({ error: "База данных временно недоступна. Попробуйте через минуту." });
    });
}

export function requireWorkspaceMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user?.workspaceId) {
    res.status(403).json({ error: "workspace_required" });
    return;
  }
  next();
}

export function requireSuperAdminMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== "superadmin") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}

export function requireWorkspaceAdminMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user?.workspaceId) {
    res.status(403).json({ error: "workspace_required" });
    return;
  }
  if (req.user.role !== "admin" && req.user.role !== "superadmin") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}

export function canAccessMarketing(role: UserRole | undefined): boolean {
  return role === "admin" || role === "marketer" || role === "manager" || role === "superadmin";
}

export function canManageIntegrations(role: UserRole | undefined): boolean {
  return role === "admin" || role === "superadmin";
}
