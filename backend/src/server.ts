import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { authMiddleware } from "./auth";
import { authRouter } from "./routes.auth";
import { conversationsRouter } from "./routes.conversations";
import { dealsRouter } from "./routes.deals";
import { metricsRouter } from "./routes.metrics";
import { startSimulator } from "./simulator";
import { createTelegramRouter, startTelegramPolling } from "./telegram";
import { ensureUserLoginSchema } from "./migrate";
import { createWhatsAppRouter } from "./whatsapp";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
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

void ensureUserLoginSchema()
  .then(() => {
    server.listen(port, () => {
      console.log(`Backend running on ${port}`);
    });
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
