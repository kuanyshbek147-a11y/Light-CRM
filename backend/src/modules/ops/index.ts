import { Router } from "express";
import { AuthRequest, requireWorkspaceAdminMiddleware } from "../../auth";
import { checkOpsHealth, setOpsAlertChatId, startOpsHealthWatcher } from "./alerts";
import {
  getOwnerDigestSettings,
  parseDigestHour,
  saveOwnerDigestSettings,
  sendOwnerDigest
} from "./owner-digest";
import { listUnassignedQueue } from "./queue";

export { startOpsHealthWatcher };
export { startNightlyBackups } from "./nightly-backup";
export { startOwnerDigests } from "./owner-digest";

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

  router.get("/digest", requireWorkspaceAdminMiddleware, async (req: AuthRequest, res) => {
    res.json(await getOwnerDigestSettings(req.user?.workspaceId || ""));
  });

  router.put("/digest", requireWorkspaceAdminMiddleware, async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const { enabled, hour } = req.body as { enabled?: unknown; hour?: unknown };
    const parsedHour = hour === undefined ? undefined : parseDigestHour(hour);
    if (parsedHour === null) {
      res.status(400).json({ error: "invalid_hour" });
      return;
    }
    await saveOwnerDigestSettings(workspaceId, {
      enabled: typeof enabled === "boolean" ? enabled : undefined,
      hour: parsedHour
    });
    res.json(await getOwnerDigestSettings(workspaceId));
  });

  router.post("/digest/test", requireWorkspaceAdminMiddleware, async (req: AuthRequest, res) => {
    const sent = await sendOwnerDigest(req.user?.workspaceId || "");
    if (!sent) {
      res.status(409).json({ error: "digest_chat_not_connected" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
