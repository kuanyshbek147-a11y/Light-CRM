import { Router } from "express";
import path from "path";
import { AuthRequest, requireWorkspaceAdminMiddleware } from "../../auth";
import { createDatabaseBackup, listDatabaseBackups } from "./backup";
import { checkOpsHealth, setOpsAlertChatId, startOpsHealthWatcher } from "./alerts";
import { listUnassignedQueue } from "./queue";

export { startOpsHealthWatcher };

export function createOpsRouter(): Router {
  const router = Router();

  router.get("/queue", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    res.json(await listUnassignedQueue(workspaceId));
  });

  router.get("/health-check", async (_req: AuthRequest, res) => {
    res.json(await checkOpsHealth());
  });

  router.get("/backups", requireWorkspaceAdminMiddleware, async (_req: AuthRequest, res) => {
    res.json(await listDatabaseBackups());
  });

  router.post("/backups", requireWorkspaceAdminMiddleware, async (_req: AuthRequest, res) => {
    const result = await createDatabaseBackup();
    if ("error" in result) {
      res.status(500).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.put("/alerts", requireWorkspaceAdminMiddleware, async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const { telegramChatId } = req.body as { telegramChatId?: string };
    await setOpsAlertChatId(workspaceId, String(telegramChatId || ""));
    res.json({ ok: true });
  });

  return router;
}

export function backupsAbsoluteDir(): string {
  return path.join(process.cwd(), "backups");
}
