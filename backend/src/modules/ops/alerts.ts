import { query } from "../../db";
import { pool } from "../../db";
import { getTelegramCredentialsForWorkspace } from "../integrations/telegram/credentials";
import { sendTelegramTextMessage } from "../integrations/telegram/api";

const KEY = "ops_alert_telegram_chat_id";
let timer: NodeJS.Timeout | null = null;
let lastAlertAt = 0;

async function getAlertChatId(): Promise<string> {
  const fromEnv = (process.env.OPS_ALERT_TELEGRAM_CHAT_ID || "").trim();
  if (fromEnv) {
    return fromEnv;
  }
  const rows = await query<{ value: string }>(
    `SELECT value FROM workspace_settings WHERE key = $1 ORDER BY updated_at DESC LIMIT 1`,
    [KEY]
  );
  return (rows[0]?.value || "").trim();
}

export async function setOpsAlertChatId(workspaceId: string, chatId: string): Promise<void> {
  await query(
    `INSERT INTO workspace_settings (workspace_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [workspaceId, KEY, chatId.trim()]
  );
}

/** Telegram-алерт workspace без throttle (лиды, задачи). Ops health — через sendAlert. */
export async function sendWorkspaceTelegramAlert(
  workspaceId: string,
  text: string
): Promise<boolean> {
  const rows = await query<{ value: string }>(
    `SELECT value FROM workspace_settings
     WHERE workspace_id = $1 AND key = $2
     LIMIT 1`,
    [workspaceId, KEY]
  );
  const chatId = (rows[0]?.value || process.env.OPS_ALERT_TELEGRAM_CHAT_ID || "").trim();
  if (!chatId) {
    return false;
  }

  const credentials = await getTelegramCredentialsForWorkspace(workspaceId);
  const botToken = (credentials?.botToken || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) {
    console.error("Workspace Telegram alert skipped: no bot token", workspaceId);
    return false;
  }

  try {
    await sendTelegramTextMessage(botToken, chatId, text);
    return true;
  } catch (error) {
    console.error("Workspace Telegram alert failed", error);
    return false;
  }
}

async function sendAlert(text: string): Promise<void> {
  const now = Date.now();
  if (now - lastAlertAt < 10 * 60_000) {
    return;
  }
  const chatId = await getAlertChatId();
  if (!chatId) {
    console.error("OPS alert (no chat configured):", text);
    return;
  }

  // Prefer first workspace with telegram bot
  const workspaces = await query<{ workspace_id: string }>(
    `SELECT DISTINCT workspace_id FROM workspace_settings WHERE key = 'telegram_bot_token' LIMIT 5`
  );
  for (const row of workspaces) {
    const credentials = await getTelegramCredentialsForWorkspace(row.workspace_id);
    if (!credentials?.botToken) continue;
    try {
      await sendTelegramTextMessage(credentials.botToken, chatId, text);
      lastAlertAt = now;
      return;
    } catch (error) {
      console.error("OPS alert send failed", error);
    }
  }

  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (envToken) {
    try {
      await sendTelegramTextMessage(envToken, chatId, text);
      lastAlertAt = now;
    } catch (error) {
      console.error("OPS alert env send failed", error);
    }
  }
}

export async function checkOpsHealth(): Promise<{ ok: boolean; detail: string }> {
  try {
    await pool.query("SELECT 1");
    return { ok: true, detail: "db_ok" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "db_error";
    await sendAlert(`🚨 Light CRM: БД недоступна\n${detail}`);
    return { ok: false, detail };
  }
}

export function startOpsHealthWatcher(): void {
  if (timer) {
    return;
  }
  timer = setInterval(() => {
    void checkOpsHealth();
  }, 5 * 60_000);
  setTimeout(() => {
    void checkOpsHealth();
  }, 45_000);
}
