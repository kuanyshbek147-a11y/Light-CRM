import { Router } from "express";
import bcrypt from "bcryptjs";
import { AuthRequest, requireSuperAdminMiddleware } from "../../auth";
import { query } from "../../db";
import { createWorkspaceUser, createWorkspaceWithAdmin } from "./provision";

type WorkspaceRow = {
  id: string;
  name: string;
  created_at: string;
  users_count: string;
  conversations_count: string;
  whatsapp_connected: boolean;
  whatsapp_phone: string | null;
};

type WorkspaceUserRow = {
  id: string;
  full_name: string;
  email: string;
  login: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
};

export const platformRouter = Router();

platformRouter.use(requireSuperAdminMiddleware);

platformRouter.get("/workspaces", async (_req: AuthRequest, res) => {
  const rows = await query<WorkspaceRow>(
    `SELECT
       w.id,
       w.name,
       w.created_at::text AS created_at,
       (SELECT COUNT(*)::text FROM users u WHERE u.workspace_id = w.id) AS users_count,
       (SELECT COUNT(*)::text FROM conversations c WHERE c.workspace_id = w.id) AS conversations_count,
       EXISTS (
         SELECT 1 FROM workspace_settings ws
         WHERE ws.workspace_id = w.id AND ws.key = 'whatsapp_meta_access_token'
       ) AS whatsapp_connected,
       (
         SELECT ws.value FROM workspace_settings ws
         WHERE ws.workspace_id = w.id AND ws.key = 'whatsapp_meta_phone_number_id'
         LIMIT 1
       ) AS whatsapp_phone
     FROM workspaces w
     ORDER BY w.created_at DESC NULLS LAST, w.name ASC`
  );

  res.json({
    workspaces: rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      usersCount: Number(row.users_count || 0),
      conversationsCount: Number(row.conversations_count || 0),
      whatsappConnected: Boolean(row.whatsapp_connected),
      whatsappPhoneNumberId: row.whatsapp_phone
    }))
  });
});

platformRouter.post("/workspaces", async (req: AuthRequest, res) => {
  const body = req.body as {
    name?: string;
    adminFullName?: string;
    adminEmail?: string;
    adminLogin?: string;
    adminPassword?: string;
  };

  try {
    const result = await createWorkspaceWithAdmin({
      name: typeof body.name === "string" ? body.name : "",
      admin: {
        fullName: typeof body.adminFullName === "string" ? body.adminFullName : "",
        email: typeof body.adminEmail === "string" ? body.adminEmail : "",
        login: typeof body.adminLogin === "string" ? body.adminLogin : "",
        password: typeof body.adminPassword === "string" ? body.adminPassword : "",
        role: "admin"
      }
    });

    res.status(201).json({
      ok: true,
      workspaceId: result.workspaceId,
      adminUserId: result.adminUserId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "create workspace failed";
    res.status(400).json({ ok: false, error: message });
  }
});

platformRouter.get("/workspaces/:workspaceId", async (req: AuthRequest, res) => {
  const workspaceId = req.params.workspaceId;
  const workspaces = await query<{ id: string; name: string; created_at: string }>(
    `SELECT id, name, created_at::text AS created_at FROM workspaces WHERE id = $1 LIMIT 1`,
    [workspaceId]
  );
  const workspace = workspaces[0];
  if (!workspace) {
    res.status(404).json({ error: "Компания не найдена" });
    return;
  }

  const users = await query<WorkspaceUserRow>(
    `SELECT id, full_name, email, login, role, is_active, created_at::text AS created_at
     FROM users
     WHERE workspace_id = $1
     ORDER BY role ASC, created_at ASC`,
    [workspaceId]
  );

  const whatsapp = await query<{ key: string; value: string }>(
    `SELECT key, value FROM workspace_settings
     WHERE workspace_id = $1
       AND key IN (
         'whatsapp_meta_waba_id',
         'whatsapp_meta_phone_number_id',
         'whatsapp_meta_connected_at'
       )`,
    [workspaceId]
  );
  const whatsappMap = Object.fromEntries(whatsapp.map((row) => [row.key, row.value]));

  res.json({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      createdAt: workspace.created_at
    },
    users: users.map((user) => ({
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      login: user.login,
      role: user.role,
      isActive: user.is_active,
      createdAt: user.created_at
    })),
    whatsapp: {
      connected: Boolean(whatsappMap.whatsapp_meta_waba_id),
      wabaId: whatsappMap.whatsapp_meta_waba_id || null,
      phoneNumberId: whatsappMap.whatsapp_meta_phone_number_id || null,
      connectedAt: whatsappMap.whatsapp_meta_connected_at || null
    }
  });
});

platformRouter.post("/workspaces/:workspaceId/users", async (req: AuthRequest, res) => {
  const body = req.body as {
    fullName?: string;
    email?: string;
    login?: string;
    password?: string;
    role?: string;
  };
  const role = body.role === "admin" ? "admin" : body.role === "marketer" ? "marketer" : "manager";

  try {
    const result = await createWorkspaceUser(req.params.workspaceId, {
      fullName: typeof body.fullName === "string" ? body.fullName : "",
      email: typeof body.email === "string" ? body.email : "",
      login: typeof body.login === "string" ? body.login : "",
      password: typeof body.password === "string" ? body.password : "",
      role
    });
    res.status(201).json({ ok: true, userId: result.userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "create user failed";
    res.status(400).json({ ok: false, error: message });
  }
});

platformRouter.patch("/users/:userId", async (req: AuthRequest, res) => {
  const body = req.body as {
    isActive?: boolean;
    password?: string;
    fullName?: string;
  };

  const users = await query<{
    id: string;
    workspace_id: string;
    role: string;
    full_name: string;
  }>(
    `SELECT id, workspace_id, role, full_name FROM users WHERE id = $1 AND role <> 'superadmin' LIMIT 1`,
    [req.params.userId]
  );
  const user = users[0];
  if (!user) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }

  const nextFullName =
    typeof body.fullName === "string" && body.fullName.trim() ? body.fullName.trim() : user.full_name;
  const nextActive = typeof body.isActive === "boolean" ? body.isActive : undefined;

  let passwordHash: string | null = null;
  if (typeof body.password === "string" && body.password.trim()) {
    if (body.password.length < 6) {
      res.status(400).json({ error: "Пароль — минимум 6 символов" });
      return;
    }
    passwordHash = await bcrypt.hash(body.password, 10);
  }

  await query(
    `UPDATE users
     SET full_name = $2,
         is_active = COALESCE($3, is_active),
         password_hash = COALESCE($4, password_hash)
     WHERE id = $1`,
    [user.id, nextFullName, nextActive ?? null, passwordHash]
  );

  if (user.role === "manager") {
    await query(
      `UPDATE managers
       SET display_name = $2,
           is_active = COALESCE($3, is_active)
       WHERE user_id = $1`,
      [user.id, nextFullName, nextActive ?? null]
    );
  }

  res.json({ ok: true });
});
