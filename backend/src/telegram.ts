import { Router } from "express";
import { Server } from "socket.io";
import { resolveAutoAssignedManager } from "./auto-assignment";
import { query } from "./db";
import { authMiddleware, type AuthRequest } from "./modules/auth";
import {
  clearWorkspaceTelegramCredentials,
  createTelegramWebhookSecret,
  findWorkspaceIdByTelegramWebhookSecret,
  getEnvTelegramCredentials,
  getTelegramCredentialsForWorkspace,
  getWorkspaceTelegramCredentials,
  isTelegramDisabledForWorkspace,
  saveWorkspaceTelegramCredentials
} from "./modules/integrations/telegram/credentials";
import {
  deleteTelegramWebhook,
  getTelegramBotProfile,
  getTelegramWebhookInfo,
  sendTelegramTextMessage,
  setTelegramWebhook
} from "./modules/integrations/telegram/api";

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: {
    id: number;
    type: string;
  };
  from?: TelegramUser;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
};

const TELEGRAM_DELIVERY_MODE = process.env.TELEGRAM_DELIVERY_MODE || "webhook";
let telegramOffset = 0;

function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || "https://light-crm-backend.onrender.com").replace(/\/+$/, "");
}

export function createTelegramRouter(io: Server): Router {
  const router = Router();

  router.post("/webhook/:secret", async (req, res) => {
    const secret = typeof req.params.secret === "string" ? req.params.secret : "";
    const update = req.body as TelegramUpdate;

    try {
      const workspaceId =
        (await findWorkspaceIdByTelegramWebhookSecret(secret)) ||
        (await resolveDefaultWorkspaceIdForSecret(secret));
      if (!workspaceId) {
        res.status(403).json({ ok: false, error: "forbidden" });
        return;
      }
      if (await isTelegramDisabledForWorkspace(workspaceId)) {
        res.json({ ok: true, ignored: true });
        return;
      }
      await processTelegramUpdate(update, io, workspaceId);
      res.json({ ok: true });
    } catch (error) {
      console.error("Telegram webhook failed", error);
      res.status(500).json({ ok: false });
    }
  });

  router.get("/status", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const disabled = await isTelegramDisabledForWorkspace(req.user.workspaceId);
    const workspaceCreds = await getWorkspaceTelegramCredentials(req.user.workspaceId);
    const envCreds = getEnvTelegramCredentials();
    const credentials = disabled ? null : workspaceCreds || envCreds;
    const missing: string[] = [];
    if (!credentials?.botToken) {
      missing.push("TELEGRAM_BOT_TOKEN");
    }

    let botUsername = credentials?.botUsername || null;
    let webhookUrl: string | null = null;
    let pendingUpdates = 0;
    let lastError: string | null = null;

    if (credentials?.botToken) {
      try {
        const [profile, webhook] = await Promise.all([
          getTelegramBotProfile(credentials.botToken),
          getTelegramWebhookInfo(credentials.botToken)
        ]);
        botUsername = profile.username || botUsername;
        webhookUrl = webhook.url || null;
        pendingUpdates = webhook.pending_update_count || 0;
        lastError = webhook.last_error_message || null;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Telegram status check failed";
      }
    }

    res.json({
      enabled: missing.length === 0,
      missing,
      connected: Boolean(credentials?.botToken),
      disabled,
      mode: TELEGRAM_DELIVERY_MODE,
      botUsername,
      botId: credentials?.botId || null,
      source: disabled ? null : workspaceCreds ? "workspace" : envCreds ? "env" : null,
      webhookPath: credentials
        ? `/api/integrations/telegram/webhook/${credentials.webhookSecret}`
        : null,
      webhookUrl,
      pendingUpdates,
      lastError,
      publicBaseUrl: publicBaseUrl()
    });
  });

  router.post("/connect", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const botToken = typeof req.body?.botToken === "string" ? req.body.botToken.trim() : "";
    if (!botToken) {
      res.status(400).json({ error: "botToken is required" });
      return;
    }

    try {
      const profile = await getTelegramBotProfile(botToken);
      const webhookSecret =
        (typeof req.body?.webhookSecret === "string" && req.body.webhookSecret.trim()) ||
        createTelegramWebhookSecret();

      await saveWorkspaceTelegramCredentials(req.user.workspaceId, {
        botToken,
        webhookSecret,
        botUsername: profile.username || "",
        botId: String(profile.id)
      });

      let webhookSet = false;
      try {
        webhookSet = await setTelegramWebhook({ botToken, webhookSecret }, publicBaseUrl());
      } catch (webhookError) {
        console.error("Telegram setWebhook warning", webhookError);
      }

      const webhook = await getTelegramWebhookInfo(botToken).catch(() => null);

      res.json({
        ok: true,
        connected: true,
        botUsername: profile.username || null,
        botId: String(profile.id),
        webhookSet,
        webhookUrl: webhook?.url || null,
        webhookPath: `/api/integrations/telegram/webhook/${webhookSecret}`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Telegram connect failed";
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/disconnect", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const workspaceCreds = await getWorkspaceTelegramCredentials(req.user.workspaceId);
    const envCreds = getEnvTelegramCredentials();
    const tokenToDetach = workspaceCreds?.botToken || envCreds?.botToken || "";
    if (tokenToDetach) {
      try {
        await deleteTelegramWebhook(tokenToDetach);
      } catch (error) {
        console.error("Telegram deleteWebhook warning", error);
      }
    }

    await clearWorkspaceTelegramCredentials(req.user.workspaceId);
    res.json({ ok: true, connected: false, disabled: true });
  });

  return router;
}

export async function sendTelegramMessageForConversation(
  conversationId: string,
  workspaceId: string,
  body: string
): Promise<string | null> {
  const rows = await query<{ channel: string; external_id: string | null }>(
    `SELECT c.channel, ct.external_id
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.id = $1 AND c.workspace_id = $2`,
    [conversationId, workspaceId]
  );

  const conversation = rows[0];
  if (!conversation || conversation.channel !== "telegram" || !conversation.external_id) {
    return null;
  }

  const credentials = await getTelegramCredentialsForWorkspace(workspaceId);
  if (!credentials?.botToken) {
    return null;
  }

  return sendTelegramTextMessage(credentials.botToken, conversation.external_id, body);
}

export function startTelegramPolling(io: Server): void {
  const envCreds = getEnvTelegramCredentials();
  if (!envCreds?.botToken || TELEGRAM_DELIVERY_MODE !== "polling") {
    return;
  }

  void initializeTelegramPolling(envCreds.botToken);

  setInterval(() => {
    void pollTelegramUpdates(io, envCreds.botToken).catch((error) => {
      console.error("Telegram polling error", error);
    });
  }, 3000);
}

async function resolveDefaultWorkspaceIdForSecret(secret: string): Promise<string | null> {
  const envSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "telegram-dev-secret";
  if (secret !== envSecret) {
    return null;
  }
  const workspaceRows = await query<{ id: string }>("SELECT id FROM workspaces ORDER BY id ASC LIMIT 1");
  const workspaceId = workspaceRows[0]?.id ?? null;
  if (!workspaceId) {
    return null;
  }
  if (await isTelegramDisabledForWorkspace(workspaceId)) {
    return null;
  }
  return workspaceId;
}

async function processTelegramUpdate(
  update: TelegramUpdate,
  io: Server,
  workspaceId: string
): Promise<void> {
  const message = update.message;
  if (!message?.text) {
    return;
  }

  const managerId = await resolveAutoAssignedManager(workspaceId);
  const contactName = formatTelegramContactName(message.from);
  const chatId = String(message.chat.id);

  const contactRows = await query<{ id: string }>(
    `SELECT id
     FROM contacts
     WHERE workspace_id = $1 AND channel = 'telegram' AND external_id = $2
     LIMIT 1`,
    [workspaceId, chatId]
  );

  const contactId =
    contactRows[0]?.id ??
    (
      await query<{ id: string }>(
        `INSERT INTO contacts (workspace_id, name, phone, channel, external_id)
         VALUES ($1, $2, $3, 'telegram', $3)
         RETURNING id`,
        [workspaceId, contactName, chatId]
      )
    )[0].id;

  const conversationRows = await query<{ id: string }>(
    `SELECT id
     FROM conversations
     WHERE workspace_id = $1 AND contact_id = $2
     LIMIT 1`,
    [workspaceId, contactId]
  );

  const conversationId =
    conversationRows[0]?.id ??
    (
      await query<{ id: string }>(
        `INSERT INTO conversations (workspace_id, contact_id, assigned_manager_id, channel, priority, first_response_due_at)
         VALUES ($1, $2, $3, 'telegram', 'normal', now() + interval '15 minutes')
         RETURNING id`,
        [workspaceId, contactId, managerId ?? null]
      )
    )[0].id;

  const externalMessageId = String(message.message_id);
  const existing = await query<{ id: string }>(
    `SELECT id FROM messages WHERE conversation_id = $1 AND external_message_id = $2 LIMIT 1`,
    [conversationId, externalMessageId]
  );
  if (existing[0]) {
    return;
  }

  const inserted = await query<{ id: string; created_at: string }>(
    `INSERT INTO messages (conversation_id, workspace_id, direction, body, external_message_id)
     VALUES ($1, $2, 'incoming', $3, $4)
     RETURNING id, created_at`,
    [conversationId, workspaceId, message.text, externalMessageId]
  );

  await query(
    `UPDATE conversations
     SET updated_at = now(),
         first_response_due_at = now() + interval '15 minutes'
     WHERE id = $1`,
    [conversationId]
  );

  io.emit("message:new", {
    conversationId,
    messageId: inserted[0].id,
    direction: "incoming",
    body: message.text,
    createdAt: inserted[0].created_at
  });
}

async function pollTelegramUpdates(io: Server, botToken: string): Promise<void> {
  const url = new URL(`https://api.telegram.org/bot${botToken}/getUpdates`);
  url.searchParams.set("timeout", "0");
  if (telegramOffset > 0) {
    url.searchParams.set("offset", String(telegramOffset));
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram getUpdates failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as { ok: boolean; result?: TelegramUpdate[] };
  const workspaceRows = await query<{ id: string }>("SELECT id FROM workspaces ORDER BY id ASC LIMIT 1");
  const workspaceId = workspaceRows[0]?.id;
  if (!workspaceId) {
    return;
  }

  for (const update of payload.result || []) {
    if (typeof update.update_id === "number") {
      telegramOffset = update.update_id + 1;
    }
    await processTelegramUpdate(update, io, workspaceId);
  }
}

async function initializeTelegramPolling(botToken: string): Promise<void> {
  try {
    await deleteTelegramWebhook(botToken);
  } catch (error) {
    console.error("Telegram deleteWebhook failed", error);
  }
}

function formatTelegramContactName(user?: TelegramUser): string {
  if (!user) {
    return "Telegram contact";
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }

  if (user.username) {
    return `@${user.username}`;
  }

  return `Telegram ${user.id}`;
}
