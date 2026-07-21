import { Router } from "express";
import { authMiddleware, type AuthRequest } from "../../auth";
import {
  getAutoReplySettings,
  saveAutoReplySettings,
  type AutoReplyMode
} from "./auto-reply";

export function createAutoReplyRouter(): Router {
  const router = Router();

  router.get("/status", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const settings = await getAutoReplySettings(req.user.workspaceId);
    res.json(settings);
  });

  router.post("/settings", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const enabled = typeof req.body?.enabled === "boolean" ? req.body.enabled : undefined;
    const mode: AutoReplyMode | undefined =
      req.body?.mode === "ai" || req.body?.mode === "rules" ? req.body.mode : undefined;
    const defaultText = typeof req.body?.defaultText === "string" ? req.body.defaultText : undefined;
    const systemPrompt =
      typeof req.body?.systemPrompt === "string" ? req.body.systemPrompt : undefined;
    const firstOnly = typeof req.body?.firstOnly === "boolean" ? req.body.firstOnly : undefined;

    const settings = await saveAutoReplySettings(req.user.workspaceId, {
      enabled,
      mode,
      defaultText,
      systemPrompt,
      firstOnly
    });
    res.json({ ok: true, ...settings });
  });

  return router;
}
