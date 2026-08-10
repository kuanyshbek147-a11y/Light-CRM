import { Router } from "express";
import { AuthRequest } from "../../auth";
import { getFollowUpSettings, setFollowUpSettings, type FollowUpSettings } from "./follow-up";

export function createFollowUpRouter(): Router {
  const router = Router();

  router.get("/settings", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const settings = await getFollowUpSettings(workspaceId);
    res.json(settings);
  });

  router.put("/settings", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const body = req.body as Partial<FollowUpSettings>;
    const settings = await setFollowUpSettings(workspaceId, body);
    res.json(settings);
  });

  return router;
}
