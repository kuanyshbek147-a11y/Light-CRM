import { query } from "../../../db";
import { randomBytes } from "crypto";

export type TelegramCredentials = {
  botToken: string;
  webhookSecret: string;
  botUsername: string;
  botId: string;
  connectedAt: string;
};

const KEYS = {
  botToken: "telegram_bot_token",
  webhookSecret: "telegram_webhook_secret",
  botUsername: "telegram_bot_username",
  botId: "telegram_bot_id",
  connectedAt: "telegram_connected_at"
} as const;

async function getSetting(workspaceId: string, key: string): Promise<string | null> {
  const rows = await query<{ value: string }>(
    `SELECT value FROM workspace_settings WHERE workspace_id = $1 AND key = $2 LIMIT 1`,
    [workspaceId, key]
  );
  return rows[0]?.value ?? null;
}

async function setSetting(workspaceId: string, key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO workspace_settings (workspace_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [workspaceId, key, value]
  );
}

export function getEnvTelegramCredentials(): TelegramCredentials | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!botToken) {
    return null;
  }
  return {
    botToken,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "telegram-dev-secret",
    botUsername: process.env.TELEGRAM_BOT_USERNAME || "",
    botId: "",
    connectedAt: new Date().toISOString()
  };
}

export async function getWorkspaceTelegramCredentials(
  workspaceId: string
): Promise<TelegramCredentials | null> {
  const [botToken, webhookSecret, botUsername, botId, connectedAt] = await Promise.all([
    getSetting(workspaceId, KEYS.botToken),
    getSetting(workspaceId, KEYS.webhookSecret),
    getSetting(workspaceId, KEYS.botUsername),
    getSetting(workspaceId, KEYS.botId),
    getSetting(workspaceId, KEYS.connectedAt)
  ]);

  if (!botToken) {
    return null;
  }

  return {
    botToken,
    webhookSecret: webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET || "telegram-dev-secret",
    botUsername: botUsername || "",
    botId: botId || "",
    connectedAt: connectedAt || new Date().toISOString()
  };
}

export async function getTelegramCredentialsForWorkspace(
  workspaceId: string
): Promise<TelegramCredentials | null> {
  const workspace = await getWorkspaceTelegramCredentials(workspaceId);
  if (workspace) {
    return workspace;
  }
  return getEnvTelegramCredentials();
}

export async function saveWorkspaceTelegramCredentials(
  workspaceId: string,
  credentials: Omit<TelegramCredentials, "connectedAt"> & { connectedAt?: string }
): Promise<void> {
  const connectedAt = credentials.connectedAt || new Date().toISOString();
  await Promise.all([
    setSetting(workspaceId, KEYS.botToken, credentials.botToken),
    setSetting(workspaceId, KEYS.webhookSecret, credentials.webhookSecret),
    setSetting(workspaceId, KEYS.botUsername, credentials.botUsername || ""),
    setSetting(workspaceId, KEYS.botId, credentials.botId || ""),
    setSetting(workspaceId, KEYS.connectedAt, connectedAt)
  ]);
}

export async function clearWorkspaceTelegramCredentials(workspaceId: string): Promise<void> {
  await query(
    `DELETE FROM workspace_settings
     WHERE workspace_id = $1
       AND key = ANY($2::text[])`,
    [workspaceId, [KEYS.botToken, KEYS.webhookSecret, KEYS.botUsername, KEYS.botId, KEYS.connectedAt]]
  );
}

export function createTelegramWebhookSecret(): string {
  return randomBytes(18).toString("hex");
}

export async function findWorkspaceIdByTelegramWebhookSecret(
  webhookSecret: string
): Promise<string | null> {
  if (!webhookSecret) {
    return null;
  }
  const rows = await query<{ workspace_id: string }>(
    `SELECT workspace_id
     FROM workspace_settings
     WHERE key = $1 AND value = $2
     LIMIT 1`,
    [KEYS.webhookSecret, webhookSecret]
  );
  return rows[0]?.workspace_id ?? null;
}
