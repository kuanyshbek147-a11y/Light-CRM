import { Router } from "express";
import { AuthRequest, requireWorkspaceAdminMiddleware } from "../../auth";
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

  // Копии базы содержат данные всех компаний — они только у супер-админа (/api/platform/backups).

  router.put("/alerts", requireWorkspaceAdminMiddleware, async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const { telegramChatId } = req.body as { telegramChatId?: string };
    await setOpsAlertChatId(workspaceId, String(telegramChatId || ""));
    res.json({ ok: true });
  });

  return router;
}
