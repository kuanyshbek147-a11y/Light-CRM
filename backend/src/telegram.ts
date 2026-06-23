import { Router } from "express";
import { Server } from "socket.io";
import { resolveAutoAssignedManager } from "./auto-assignment";
import { query } from "./db";

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

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "telegram-dev-secret";
const TELEGRAM_DELIVERY_MODE = process.env.TELEGRAM_DELIVERY_MODE || "webhook";
let telegramOffset = 0;

export function createTelegramRouter(io: Server): Router {
  const router = Router();

  router.post(`/webhook/${TELEGRAM_WEBHOOK_SECRET}`, async (req, res) => {
    const update = req.body as TelegramUpdate;

    try {
      await processTelegramUpdate(update, io);
      res.json({ ok: true });
    } catch (error) {
      console.error("Telegram webhook failed", error);
      res.status(500).json({ ok: false });
    }
  });

  router.get("/status", (_req, res) => {
    res.json({
      enabled: Boolean(TELEGRAM_BOT_TOKEN),
      mode: TELEGRAM_DELIVERY_MODE,
      webhookPath: `/api/integrations/telegram/webhook/${TELEGRAM_WEBHOOK_SECRET}`
    });
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
  if (!conversation || conversation.channel !== "telegram" || !conversation.external_id || !TELEGRAM_BOT_TOKEN) {
    return null;
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: conversation.external_id,
      text: body
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as { result?: { message_id?: number } };
  return payload.result?.message_id ? String(payload.result.message_id) : null;
}

export function startTelegramPolling(io: Server): void {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_DELIVERY_MODE !== "polling") {
    return;
  }

  void initializeTelegramPolling();

  setInterval(() => {
    void pollTelegramUpdates(io).catch((error) => {
      console.error("Telegram polling error", error);
    });
  }, 3000);
}

async function processTelegramUpdate(update: TelegramUpdate, io: Server): Promise<void> {
  const message = update.message;
  if (!message?.text) {
    return;
  }

  const workspaceRows = await query<{ id: string }>("SELECT id FROM workspaces ORDER BY id ASC LIMIT 1");
  const workspaceId = workspaceRows[0]?.id;
  if (!workspaceId) {
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

  const inserted = await query<{ id: string; created_at: string }>(
    `INSERT INTO messages (conversation_id, workspace_id, direction, body, external_message_id)
     VALUES ($1, $2, 'incoming', $3, $4)
     RETURNING id, created_at`,
    [conversationId, workspaceId, message.text, String(message.message_id)]
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

async function pollTelegramUpdates(io: Server): Promise<void> {
  const url = new URL(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`);
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
  for (const update of payload.result || []) {
    if (typeof update.update_id === "number") {
      telegramOffset = update.update_id + 1;
    }
    await processTelegramUpdate(update, io);
  }
}

async function initializeTelegramPolling(): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      drop_pending_updates: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Telegram deleteWebhook failed: ${response.status} ${errorText}`);
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
