import { Router } from "express";
import bcrypt from "bcryptjs";
import { AuthRequest, forgetUserActiveState, requireWorkspaceAdminMiddleware } from "../../auth";
import { query } from "../../db";
import { createWorkspaceUser } from "../platform/provision";
import { TEAM_PASSWORD_MIN, validateNewTeamUser } from "./validation";

type TeamUserRow = {
  id: string;
  full_name: string;
  login: string | null;
  email: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
};

/** Сотрудники кабинета: владелец сам добавляет менеджеров и отключает уволенных. */
export function createTeamRouter(): Router {
  const router = Router();
  router.use(requireWorkspaceAdminMiddleware);

  router.get("/users", async (req: AuthRequest, res) => {
    const users = await query<TeamUserRow>(
      `SELECT id, full_name, login, email, role, is_active, last_login_at
       FROM users
       WHERE workspace_id = $1 AND role <> 'superadmin'
       ORDER BY is_active DESC, role = 'admin' DESC, full_name`,
      [req.user?.workspaceId]
    );
    res.json({ users, currentUserId: req.user?.id });
  });

  router.post("/users", async (req: AuthRequest, res) => {
    const parsed = validateNewTeamUser((req.body ?? {}) as Record<string, unknown>);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      const { userId } = await createWorkspaceUser(req.user?.workspaceId as string, parsed.value);
      res.status(201).json({ ok: true, userId });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Не удалось добавить сотрудника" });
    }
  });

  router.patch("/users/:userId", async (req: AuthRequest, res) => {
    const body = (req.body ?? {}) as { isActive?: unknown; password?: unknown };
    const workspaceId = req.user?.workspaceId;

    const rows = await query<{ id: string; role: string; is_active: boolean }>(
      `SELECT id, role, is_active FROM users
       WHERE id = $1 AND workspace_id = $2 AND role <> 'superadmin'
       LIMIT 1`,
      [req.params.userId, workspaceId]
    );
    const user = rows[0];
    if (!user) {
      res.status(404).json({ error: "Сотрудник не найден" });
      return;
    }

    const nextActive = typeof body.isActive === "boolean" ? body.isActive : null;
    if (nextActive === false) {
      if (user.id === req.user?.id) {
        res.status(400).json({ error: "Нельзя отключить самого себя" });
        return;
      }
      if (user.role === "admin") {
        const admins = await query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM users
           WHERE workspace_id = $1 AND role = 'admin' AND is_active = true AND id <> $2`,
          [workspaceId, user.id]
        );
        if (Number(admins[0]?.count || 0) === 0) {
          res.status(400).json({ error: "В кабинете должен остаться хотя бы один администратор" });
          return;
        }
      }
    }

    let passwordHash: string | null = null;
    if (typeof body.password === "string" && body.password) {
      if (body.password.length < TEAM_PASSWORD_MIN) {
        res.status(400).json({ error: `Пароль — минимум ${TEAM_PASSWORD_MIN} символов` });
        return;
      }
      passwordHash = await bcrypt.hash(body.password, 10);
    }

    await query(
      `UPDATE users
       SET is_active = COALESCE($2, is_active),
           password_hash = COALESCE($3, password_hash)
       WHERE id = $1`,
      [user.id, nextActive, passwordHash]
    );
    if (user.role === "manager" && nextActive !== null) {
      await query(`UPDATE managers SET is_active = $2 WHERE user_id = $1`, [user.id, nextActive]);
    }
    forgetUserActiveState(user.id);

    res.json({ ok: true });
  });

  return router;
}
