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
import { createTelegramRouter, startTelegramPolling } from "./modules/integrations/telegram";
import { createWhatsAppRouter } from "./modules/integrations/whatsapp";
import { platformRouter } from "./modules/platform";
import { startSimulator } from "./simulator";
import { ensureUserLoginSchema } from "./migrate";
import { requireWorkspaceMiddleware } from "./auth";
import { setRealtimeServer } from "./realtime";

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

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/platform", authMiddleware, platformRouter);
app.use("/api/integrations/telegram", createTelegramRouter(io));
app.use("/api/integrations/whatsapp", createWhatsAppRouter(io));
app.use("/api/integrations/instagram", createInstagramRouter(io));
app.use("/api/conversations", authMiddleware, requireWorkspaceMiddleware, conversationsRouter);
app.use("/api/deals", authMiddleware, requireWorkspaceMiddleware, dealsRouter);
app.use("/api/metrics", authMiddleware, requireWorkspaceMiddleware, metricsRouter);
startSimulator(io);
startTelegramPolling(io);

const publicDir = path.join(process.cwd(), "public");
const publicIndex = path.join(publicDir, "index.html");
if (fs.existsSync(publicIndex)) {
  app.use(express.static(publicDir, { index: false, maxAge: "1h" }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path === "/health") {
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

void ensureUserLoginSchema()
  .then(() => {
    console.log("Database schema ready");
  })
  .catch((error) => {
    console.error("Migration failed (will retry on requests):", error);
  });
