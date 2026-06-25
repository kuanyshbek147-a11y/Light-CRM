import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export type UserRole = "admin" | "manager" | "superadmin";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    workspaceId: string | null;
    role: UserRole;
  };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    const payload = jwt.verify(token, JWT_SECRET) as AuthRequest["user"];
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
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
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  next();
}
