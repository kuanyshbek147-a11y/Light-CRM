import "./load-env";
import cors from "cors";
import express from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { authMiddleware, authRouter } from "./modules/auth";
import { metricsRouter } from "./modules/analytics";
import { conversationsRouter } from "./modules/conversations";
import { dealsRouter } from "./modules/deals";
import { createInstagramRouter } from "./modules/integrations/instagram";
import {
  createEmailRouter,
  startEmailPolling
} from "./modules/integrations/email";
import { createTelegramRouter, startTelegramPolling } from "./modules/integrations/telegram";
import {
  attachWebChatSocketHandlers,
  createWebChatRouter
} from "./modules/integrations/webchat";
import { createWhatsAppRouter } from "./modules/integrations/whatsapp";
import { platformRouter } from "./modules/platform";
import { createAutoReplyRouter } from "./modules/auto-reply";
import { createPublicKnowledgeRouter } from "./modules/knowledge/public";
import { startSimulator } from "./simulator";
import { ensureUserLoginSchema, ensureDemoIntegrations } from "./migrate";
import { requireWorkspaceMiddleware } from "./auth";
import { setRealtimeServer } from "./realtime";
import { createFollowUpRouter, startFollowUpScanner } from "./modules/follow-up";
import { createAdsRouter, startAdsMetricsWorker } from "./modules/ads";
import { createMarketingRouter, startCampaignWorker, startContentScheduler, startSequenceWorker } from "./modules/marketing";
import { createOpsRouter, startOpsHealthWatcher, backupsAbsoluteDir } from "./modules/ops";
import { tasksRouter } from "./modules/tasks";
import { contactsRouter } from "./modules/contacts";
import { searchRouter } from "./modules/search";

const app = express();
app.use(cors());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    }
  })
);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});
setRealtimeServer(io);
attachWebChatSocketHandlers(io);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/help", createPublicKnowledgeRouter());
app.use("/kb", createPublicKnowledgeRouter());
app.use("/api/auth", authRouter);
app.use("/api/platform", authMiddleware, platformRouter);
app.use("/api/integrations/telegram", createTelegramRouter(io));
app.use("/api/integrations/whatsapp", createWhatsAppRouter(io));
app.use("/api/integrations/instagram", createInstagramRouter(io));
app.use("/api/integrations/webchat", createWebChatRouter(io));
app.use("/api/integrations/email", createEmailRouter(io));
app.use("/api/integrations/auto-reply", createAutoReplyRouter());
app.use("/api/conversations", authMiddleware, requireWorkspaceMiddleware, conversationsRouter);
app.use("/api/deals", authMiddleware, requireWorkspaceMiddleware, dealsRouter);
app.use("/api/tasks", authMiddleware, requireWorkspaceMiddleware, tasksRouter);
app.use("/api/contacts", authMiddleware, requireWorkspaceMiddleware, contactsRouter);
app.use("/api/search", authMiddleware, requireWorkspaceMiddleware, searchRouter);
app.use("/api/follow-up", authMiddleware, requireWorkspaceMiddleware, createFollowUpRouter());
app.use("/api/marketing", authMiddleware, requireWorkspaceMiddleware, createMarketingRouter());
app.use("/api/ads", authMiddleware, requireWorkspaceMiddleware, createAdsRouter());
app.use("/api/ops", authMiddleware, requireWorkspaceMiddleware, createOpsRouter());
app.use("/api/metrics", authMiddleware, requireWorkspaceMiddleware, metricsRouter);
startSimulator(io);
startTelegramPolling(io);
startEmailPolling(io);

const publicDir = path.join(process.cwd(), "public");
const publicIndex = path.join(publicDir, "index.html");
app.use("/backups", express.static(backupsAbsoluteDir(), { index: false, maxAge: "1h" }));
const widgetSourceCandidates = [
  path.join(process.cwd(), "src", "modules", "integrations", "webchat", "widget.js"),
  path.join(__dirname, "modules", "integrations", "webchat", "widget.js"),
  path.join(publicDir, "widget.js")
];

app.get("/widget.js", (_req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const widgetPath = widgetSourceCandidates.find((candidate) => fs.existsSync(candidate));
  if (widgetPath) {
    res.sendFile(widgetPath);
    return;
  }
  res.status(404).type("text/plain").send("widget.js not found");
});

if (fs.existsSync(publicIndex)) {
  app.use(express.static(publicDir, { index: false, maxAge: "1h" }));
  app.get("*", (req, res, next) => {
    if (
      req.path.startsWith("/api") ||
      req.path.startsWith("/uploads") ||
      req.path === "/health" ||
      req.path === "/widget.js"
    ) {
      next();
      return;
    }
    res.sendFile(publicIndex);
  });
}

const port = Number(process.env.PORT || 4000);

server.listen(port, () => {
  console.log(`Backend running on ${port}`);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection (kept alive):", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception (kept alive):", error);
});

void ensureUserLoginSchema()
  .then(async () => {
    console.log("Database schema ready");
    await ensureDemoIntegrations();
    startFollowUpScanner();
    startCampaignWorker();
    startContentScheduler();
    startSequenceWorker();
    startOpsHealthWatcher();
    startAdsMetricsWorker();
  })
  .catch((error) => {
    console.error("Migration failed (will retry on requests):", error);
  });
