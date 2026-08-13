import { Router } from "express";
import { AuthRequest } from "../../auth";
import {
  getMetaAdsSettingsPublic,
  saveMetaAdsCredentials
} from "./credentials";
import {
  createAdsCampaign,
  listAdsAudiences,
  listAdsCampaigns,
  refreshCampaignMetrics,
  setAdsCampaignStatus,
  syncAudienceFromSegment
} from "./service";

function canManageAds(req: AuthRequest): boolean {
  const role = req.user?.role;
  return role === "admin" || role === "marketer" || role === "superadmin";
}

export function createAdsRouter(): Router {
  const router = Router();

  router.get("/settings", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    res.json(await getMetaAdsSettingsPublic(workspaceId));
  });

  router.put("/settings", async (req: AuthRequest, res) => {
    if (!canManageAds(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const workspaceId = req.user?.workspaceId || "";
    const { accessToken, adAccountId, pageId, defaultLinkUrl } = req.body as {
      accessToken?: string;
      adAccountId?: string;
      pageId?: string;
      defaultLinkUrl?: string;
    };
    res.json(
      await saveMetaAdsCredentials(workspaceId, {
        accessToken,
        adAccountId,
        pageId,
        defaultLinkUrl
      })
    );
  });

  router.get("/audiences", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    res.json(await listAdsAudiences(workspaceId));
  });

  router.post("/audiences/sync", async (req: AuthRequest, res) => {
    if (!canManageAds(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const workspaceId = req.user?.workspaceId || "";
    const { segmentId, name } = req.body as { segmentId?: string; name?: string };
    const result = await syncAudienceFromSegment({
      workspaceId,
      segmentId: String(segmentId || ""),
      name
    });
    if ("error" in result) {
      const status =
        result.error === "segment_not_found"
          ? 404
          : result.error === "ads_not_connected"
            ? 503
            : 400;
      res.status(status).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.get("/campaigns", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    res.json(await listAdsCampaigns(workspaceId));
  });

  router.post("/campaigns", async (req: AuthRequest, res) => {
    if (!canManageAds(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    const { audienceId, postId, name, dailyBudget, currency, activate, linkUrl } = req.body as {
      audienceId?: string;
      postId?: string;
      name?: string;
      dailyBudget?: number;
      currency?: string;
      activate?: boolean;
      linkUrl?: string;
    };
    const result = await createAdsCampaign({
      workspaceId,
      userId,
      audienceId: String(audienceId || ""),
      postId,
      name: String(name || ""),
      dailyBudget: Number(dailyBudget || 0),
      currency,
      activate: Boolean(activate),
      linkUrl
    });
    if ("error" in result) {
      const status = result.error === "ads_not_connected" ? 503 : 400;
      res.status(status).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.post("/campaigns/:campaignId/activate", async (req: AuthRequest, res) => {
    if (!canManageAds(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const workspaceId = req.user?.workspaceId || "";
    const result = await setAdsCampaignStatus(workspaceId, req.params.campaignId, "active");
    if ("error" in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  router.post("/campaigns/:campaignId/pause", async (req: AuthRequest, res) => {
    if (!canManageAds(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const workspaceId = req.user?.workspaceId || "";
    const result = await setAdsCampaignStatus(workspaceId, req.params.campaignId, "paused");
    if ("error" in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  router.post("/campaigns/:campaignId/refresh-metrics", async (req: AuthRequest, res) => {
    if (!canManageAds(req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const workspaceId = req.user?.workspaceId || "";
    const count = await refreshCampaignMetrics(workspaceId, req.params.campaignId);
    const campaigns = await listAdsCampaigns(workspaceId);
    const campaign = campaigns.find((item) => item.id === req.params.campaignId);
    res.json({ updated: count, campaign });
  });

  return router;
}
