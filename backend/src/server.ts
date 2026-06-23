import "./load-env";
import cors from "cors";
import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { authMiddleware, authRouter } from "./modules/auth";
import { metricsRouter } from "./modules/analytics";
import { conversationsRouter } from "./modules/conversations";
import { dealsRouter } from "./modules/deals";
import { createTelegramRouter, startTelegramPolling } from "./modules/integrations/telegram";
import { createWhatsAppRouter } from "./modules/integrations/whatsapp";
import { startSimulator } from "./simulator";
import { ensureUserLoginSchema } from "./migrate";

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

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/integrations/telegram", createTelegramRouter(io));
app.use("/api/integrations/whatsapp", createWhatsAppRouter(io));
app.use("/api/conversations", authMiddleware, conversationsRouter);
app.use("/api/deals", authMiddleware, dealsRouter);
app.use("/api/metrics", authMiddleware, metricsRouter);
startSimulator(io);
startTelegramPolling(io);

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
