import { Router } from "express";
import multer from "multer";
import { AuthRequest } from "../../auth";
import { mediaUpload, resolveAttachmentType } from "../media/upload";
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  startCampaign
} from "./campaigns";
import {
  generateMarketingImage,
  generateMarketingLandingDraft,
  generateMarketingPostText,
  generateMarketingWeekPlan,
  isMarketingAiConfigured,
  plannedAtForWeekDay
} from "./generate";
import { getCampaignReports } from "./reports";
import {
  createSequence,
  listSequences,
  startSequence
} from "./sequences";
import {
  createCampaignFromPost,
  createContentPost,
  deleteContentPost,
  getContentPost,
  listContentPosts,
  publishContentPostSocial,
  updateContentPost,
  type MarketingContentPost
} from "./posts";
import {
  getMarketingSocialSettings,
  setMarketingSocialSettings
} from "./social";
import {
  createSegment,
  deleteSegment,
  getSegment,
  listSegments,
  resolveSegmentContacts,
  updateSegment
} from "./segments";
import {
  createLandingPage,
  deleteLandingPage,
  duplicateLandingPage,
  listLandingPages,
  updateLandingPage
} from "./landings";

export function createMarketingRouter(): Router {
  const router = Router();

  router.get("/ai-status", async (_req: AuthRequest, res) => {
    res.json({ configured: isMarketingAiConfigured() });
  });

  router.post("/generate/text", async (req: AuthRequest, res) => {
    const { topic, channel, tone, offer, language } = req.body as {
      topic?: string;
      channel?: string;
      tone?: string;
      offer?: string;
      language?: string;
    };
    const result = await generateMarketingPostText({
      topic: String(topic || ""),
      channel,
      tone,
      offer,
      language
    });
    if ("error" in result) {
      const status = result.error === "openai_not_configured" ? 503 : 400;
      res.status(status).json(result);
      return;
    }
    res.json(result);
  });

  router.post("/generate/landing", async (req: AuthRequest, res) => {
    const { topic, brandName, offer, tone, language } = req.body as {
      topic?: string;
      brandName?: string;
      offer?: string;
      tone?: string;
      language?: string;
    };
    const result = await generateMarketingLandingDraft({
      topic: String(topic || ""),
      brandName,
      offer,
      tone,
      language
    });
    if ("error" in result) {
      const status = result.error === "openai_not_configured" ? 503 : 400;
      res.status(status).json(result);
      return;
    }
    res.json(result);
  });

  router.post("/generate/image", async (req: AuthRequest, res) => {
    const { prompt, title } = req.body as { prompt?: string; title?: string };
    const result = await generateMarketingImage({
      prompt: String(prompt || ""),
      title
    });
    if ("error" in result) {
      const status = result.error === "openai_not_configured" ? 503 : 400;
      res.status(status).json(result);
      return;
    }
    res.json(result);
  });

  router.post("/generate/week", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    const {
      topic,
      channel,
      tone,
      offer,
      language,
      days,
      status,
      autoPublishSocial,
      autoBroadcast,
      segmentId,
      withImages
    } = req.body as {
      topic?: string;
      channel?: string;
      tone?: string;
      offer?: string;
      language?: string;
      days?: number;
      status?: string;
      autoPublishSocial?: boolean;
      autoBroadcast?: boolean;
      segmentId?: string | null;
      withImages?: boolean;
    };

    const plan = await generateMarketingWeekPlan({
      topic: String(topic || ""),
      channel,
      tone,
      offer,
      language,
      days
    });
    if ("error" in plan) {
      const code = plan.error === "openai_not_configured" ? 503 : 400;
      res.status(code).json(plan);
      return;
    }

    const postChannel = String(channel || "telegram").trim().toLowerCase() || "telegram";
    const postStatus = String(status || "draft").trim().toLowerCase() || "draft";
    const created: MarketingContentPost[] = [];

    for (const item of plan) {
      let imageUrl: string | null = null;
      if (withImages) {
        const image = await generateMarketingImage({
          prompt: item.imagePrompt || item.title,
          title: item.title
        });
        if (!("error" in image)) {
          imageUrl = image.imageUrl;
        }
      }

      const post = await createContentPost({
        workspaceId,
        userId,
        title: `[${item.theme}] ${item.title}`.slice(0, 120),
        body: item.body,
        channel: postChannel,
        status: postStatus,
        plannedAt: plannedAtForWeekDay(item.dayOffset),
        segmentId: segmentId || null,
        autoBroadcast: Boolean(autoBroadcast),
        autoPublishSocial: Boolean(autoPublishSocial),
        imageUrl
      });
      if ("error" in post) {
        continue;
      }
      created.push(post);
    }

    if (!created.length) {
      res.status(500).json({ error: "week_create_failed" });
      return;
    }

    res.status(201).json({
      count: created.length,
      posts: created
    });
  });

  router.get("/segments", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    res.json(await listSegments(workspaceId));
  });

  router.post("/segments", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    const { name, filter } = req.body as { name?: string; filter?: unknown };
    const cleanName = String(name || "").trim();
    if (!cleanName) {
      res.status(400).json({ error: "segment_name_required" });
      return;
    }
    const segment = await createSegment({
      workspaceId,
      userId,
      name: cleanName,
      filter
    });
    res.status(201).json(segment);
  });

  router.patch("/segments/:segmentId", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const { name, filter } = req.body as { name?: string; filter?: unknown };
    const segment = await updateSegment({
      workspaceId,
      segmentId: req.params.segmentId,
      name,
      filter
    });
    if (!segment) {
      res.status(404).json({ error: "segment_not_found" });
      return;
    }
    res.json(segment);
  });

  router.delete("/segments/:segmentId", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const ok = await deleteSegment(workspaceId, req.params.segmentId);
    if (!ok) {
      res.status(404).json({ error: "segment_not_found" });
      return;
    }
    res.json({ ok: true });
  });

  router.get("/segments/:segmentId/preview", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const segment = await getSegment(workspaceId, req.params.segmentId);
    if (!segment) {
      res.status(404).json({ error: "segment_not_found" });
      return;
    }
    const contacts = await resolveSegmentContacts(workspaceId, segment.filter_json || {}, 50);
    res.json({
      segment,
      count: segment.contact_count || contacts.length,
      sample: contacts
    });
  });

  router.get("/posts", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    res.json(await listContentPosts(workspaceId));
  });

  router.post("/posts", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    const {
      title,
      body,
      channel,
      status,
      plannedAt,
      segmentId,
      autoBroadcast,
      autoPublishSocial,
      imageUrl
    } = req.body as {
      title?: string;
      body?: string;
      channel?: string;
      status?: string;
      plannedAt?: string | null;
      segmentId?: string | null;
      autoBroadcast?: boolean;
      autoPublishSocial?: boolean;
      imageUrl?: string | null;
    };
    const result = await createContentPost({
      workspaceId,
      userId,
      title: String(title || ""),
      body: String(body || ""),
      channel,
      status,
      plannedAt,
      segmentId,
      autoBroadcast,
      autoPublishSocial,
      imageUrl
    });
    if ("error" in result) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.patch("/posts/:postId", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const {
      title,
      body,
      channel,
      status,
      plannedAt,
      segmentId,
      autoBroadcast,
      autoPublishSocial,
      imageUrl,
      clearScheduleProcessed
    } = req.body as {
      title?: string;
      body?: string;
      channel?: string;
      status?: string;
      plannedAt?: string | null;
      segmentId?: string | null;
      autoBroadcast?: boolean;
      autoPublishSocial?: boolean;
      imageUrl?: string | null;
      clearScheduleProcessed?: boolean;
    };
    const post = await updateContentPost({
      workspaceId,
      postId: req.params.postId,
      title,
      body,
      channel,
      status,
      plannedAt,
      segmentId,
      autoBroadcast,
      autoPublishSocial,
      imageUrl,
      clearScheduleProcessed
    });
    if (!post) {
      res.status(404).json({ error: "post_not_found" });
      return;
    }
    res.json(post);
  });

  router.delete("/posts/:postId", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const ok = await deleteContentPost(workspaceId, req.params.postId);
    if (!ok) {
      res.status(404).json({ error: "post_not_found" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/posts/:postId/publish-social", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const result = await publishContentPostSocial(workspaceId, req.params.postId);
    if ("error" in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  router.post("/posts/:postId/approve", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const post = await updateContentPost({
      workspaceId,
      postId: req.params.postId,
      status: "ready",
      clearScheduleProcessed: true
    });
    if (!post) {
      res.status(404).json({ error: "post_not_found" });
      return;
    }
    res.json(post);
  });

  router.post("/posts/:postId/rewrite", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const existing = await getContentPost(workspaceId, req.params.postId);
    if (!existing) {
      res.status(404).json({ error: "post_not_found" });
      return;
    }
    const draft = await generateMarketingPostText({
      topic: existing.title,
      channel: existing.channel,
      offer: existing.body.slice(0, 400)
    });
    if ("error" in draft) {
      res.status(400).json(draft);
      return;
    }
    const post = await updateContentPost({
      workspaceId,
      postId: req.params.postId,
      title: draft.title,
      body: draft.body,
      status: "draft"
    });
    res.json(post);
  });

  router.post("/posts/:postId/to-campaign", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    const { segmentId, channel, start } = req.body as {
      segmentId?: string;
      channel?: string;
      start?: boolean;
    };
    const result = await createCampaignFromPost({
      workspaceId,
      userId,
      postId: req.params.postId,
      segmentId: String(segmentId || ""),
      channel,
      start: Boolean(start)
    });
    if ("error" in result) {
      const statusCode =
        result.error === "post_not_found" || result.error === "segment_not_found" ? 404 : 400;
      res.status(statusCode).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.get("/social-settings", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    res.json(await getMarketingSocialSettings(workspaceId));
  });

  router.put("/social-settings", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const { telegramChannelId } = req.body as { telegramChannelId?: string };
    res.json(await setMarketingSocialSettings(workspaceId, { telegramChannelId }));
  });

  router.get("/campaigns", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    res.json(await listCampaigns(workspaceId));
  });

  router.get("/campaigns/:campaignId", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const campaign = await getCampaign(workspaceId, req.params.campaignId);
    if (!campaign) {
      res.status(404).json({ error: "campaign_not_found" });
      return;
    }
    res.json(campaign);
  });

  router.post("/campaigns", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    const { name, segmentId, channel, body, templateName, templateLang } = req.body as {
      name?: string;
      segmentId?: string;
      channel?: string;
      body?: string;
      templateName?: string;
      templateLang?: string;
    };
    const result = await createCampaign({
      workspaceId,
      userId,
      name: String(name || ""),
      segmentId: String(segmentId || ""),
      channel: String(channel || "whatsapp"),
      body: String(body || ""),
      templateName,
      templateLang
    });
    if ("error" in result) {
      const status =
        result.error === "segment_not_found"
          ? 404
          : result.error === "invalid_channel"
            ? 400
            : 400;
      res.status(status).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.post("/campaigns/:campaignId/start", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const result = await startCampaign(workspaceId, req.params.campaignId);
    if ("error" in result) {
      const status =
        result.error === "campaign_not_found" || result.error === "segment_not_found"
          ? 404
          : 400;
      res.status(status).json(result);
      return;
    }
    res.json(result);
  });

  router.get("/reports/campaigns", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    res.json(await getCampaignReports(workspaceId));
  });

  router.get("/sequences", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    res.json(await listSequences(workspaceId));
  });

  router.post("/sequences", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    const body = req.body as {
      name?: string;
      segmentId?: string;
      channel?: string;
      step0Body?: string;
      step3Body?: string;
      step7Body?: string;
      templateName?: string;
      templateLang?: string;
    };
    const result = await createSequence({
      workspaceId,
      userId,
      name: String(body.name || ""),
      segmentId: String(body.segmentId || ""),
      channel: String(body.channel || "whatsapp"),
      step0Body: String(body.step0Body || ""),
      step3Body: String(body.step3Body || ""),
      step7Body: String(body.step7Body || ""),
      templateName: body.templateName,
      templateLang: body.templateLang
    });
    if ("error" in result) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.post("/sequences/:sequenceId/start", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const result = await startSequence(workspaceId, req.params.sequenceId);
    if ("error" in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  router.get("/landings", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    res.json(await listLandingPages(workspaceId));
  });

  router.post("/landings/upload-image", (req: AuthRequest, res) => {
    mediaUpload.single("file")(req, res, (err: unknown) => {
      void (async () => {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: "Файл слишком большой (макс. 20 МБ)" });
          return;
        }
        if (err) {
          res.status(400).json({ error: "Не удалось загрузить файл" });
          return;
        }
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "Выберите изображение" });
          return;
        }
        if (resolveAttachmentType(file.mimetype) !== "image") {
          res.status(400).json({ error: "Нужно изображение (jpeg/png/webp/gif)" });
          return;
        }
        const publicBase = (
          process.env.PUBLIC_BASE_URL ||
          process.env.RENDER_EXTERNAL_URL ||
          "https://light-crm-backend.onrender.com"
        ).replace(/\/+$/, "");
        const relativeUrl = `/uploads/${file.filename}`;
        res.status(201).json({
          imageUrl: `${publicBase}${relativeUrl}`,
          relativeUrl
        });
      })();
    });
  });

  router.post("/landings", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const body = req.body || {};
    const result = await createLandingPage(workspaceId, req.user?.id || null, {
      title: String(body.title || ""),
      brandName: body.brandName,
      headline: body.headline,
      subheadline: body.subheadline,
      body: body.body,
      ctaLabel: body.ctaLabel,
      ctaUrl: body.ctaUrl,
      phone: body.phone,
      heroImageUrl: body.heroImageUrl,
      ctaPrefill: body.ctaPrefill,
      status: body.status,
      slug: body.slug
    });
    if ("error" in result) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.patch("/landings/:landingId", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const body = req.body || {};
    const result = await updateLandingPage(workspaceId, req.params.landingId, {
      title: body.title,
      brandName: body.brandName,
      headline: body.headline,
      subheadline: body.subheadline,
      body: body.body,
      ctaLabel: body.ctaLabel,
      ctaUrl: body.ctaUrl,
      phone: body.phone,
      heroImageUrl: body.heroImageUrl,
      ctaPrefill: body.ctaPrefill,
      status: body.status,
      slug: body.slug
    });
    if ("error" in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  router.post("/landings/:landingId/duplicate", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const result = await duplicateLandingPage(
      workspaceId,
      req.params.landingId,
      req.user?.id || null
    );
    if ("error" in result) {
      res.status(404).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.delete("/landings/:landingId", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const result = await deleteLandingPage(workspaceId, req.params.landingId);
    if ("error" in result) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  });

  return router;
}
