import { randomBytes } from "crypto";
import { query } from "../../../db";

export type WebChatSettings = {
  widgetId: string;
  enabled: boolean;
  title: string;
  greeting: string;
  primaryColor: string;
  connectedAt: string;
};

const KEYS = {
  widgetId: "webchat_widget_id",
  enabled: "webchat_enabled",
  title: "webchat_title",
  greeting: "webchat_greeting",
  primaryColor: "webchat_primary_color",
  connectedAt: "webchat_connected_at"
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

export function createWebChatWidgetId(): string {
  return `wc_${randomBytes(12).toString("hex")}`;
}

/** Stable widget id for the public Light CRM landing page demo chat. */
export const DEMO_LANDING_WIDGET_ID = "wc_lightcrm_landing_demo";

export async function ensureDemoLandingWebChat(): Promise<void> {
  const workspace = await query<{ id: string }>(
    `SELECT id FROM workspaces WHERE name = 'Demo Workspace' LIMIT 1`
  );
  const workspaceId = workspace[0]?.id;
  if (!workspaceId) {
    return;
  }

  const current = await getWorkspaceWebChatSettings(workspaceId);
  await saveWorkspaceWebChatSettings(workspaceId, {
    widgetId: DEMO_LANDING_WIDGET_ID,
    enabled: true,
    title: current?.title || "Light CRM",
    greeting: current?.greeting || "Здравствуйте! Напишите нам — ответим в ближайшее время.",
    primaryColor: current?.primaryColor || "#5b5ce9"
  });
}

export function createWebChatVisitorToken(): string {
  return `vis_${randomBytes(18).toString("hex")}`;
}

export async function getWorkspaceWebChatSettings(
  workspaceId: string
): Promise<WebChatSettings | null> {
  const [widgetId, enabled, title, greeting, primaryColor, connectedAt] = await Promise.all([
    getSetting(workspaceId, KEYS.widgetId),
    getSetting(workspaceId, KEYS.enabled),
    getSetting(workspaceId, KEYS.title),
    getSetting(workspaceId, KEYS.greeting),
    getSetting(workspaceId, KEYS.primaryColor),
    getSetting(workspaceId, KEYS.connectedAt)
  ]);

  if (!widgetId) {
    return null;
  }

  return {
    widgetId,
    enabled: enabled === "1" || enabled === "true",
    title: title || "Онлайн-чат",
    greeting: greeting || "Здравствуйте! Напишите нам — ответим в ближайшее время.",
    primaryColor: primaryColor || "#5b5ce9",
    connectedAt: connectedAt || new Date().toISOString()
  };
}

export async function saveWorkspaceWebChatSettings(
  workspaceId: string,
  settings: {
    widgetId: string;
    enabled?: boolean;
    title?: string;
    greeting?: string;
    primaryColor?: string;
  }
): Promise<WebChatSettings> {
  const connectedAt = new Date().toISOString();
  await Promise.all([
    setSetting(workspaceId, KEYS.widgetId, settings.widgetId),
    setSetting(workspaceId, KEYS.enabled, settings.enabled === false ? "0" : "1"),
    setSetting(workspaceId, KEYS.title, settings.title?.trim() || "Онлайн-чат"),
    setSetting(
      workspaceId,
      KEYS.greeting,
      settings.greeting?.trim() || "Здравствуйте! Напишите нам — ответим в ближайшее время."
    ),
    setSetting(workspaceId, KEYS.primaryColor, settings.primaryColor?.trim() || "#5b5ce9"),
    setSetting(workspaceId, KEYS.connectedAt, connectedAt)
  ]);

  return (await getWorkspaceWebChatSettings(workspaceId)) as WebChatSettings;
}

export async function disableWorkspaceWebChat(workspaceId: string): Promise<void> {
  await setSetting(workspaceId, KEYS.enabled, "0");
}

export async function findWorkspaceIdByWidgetId(widgetId: string): Promise<string | null> {
  if (!widgetId) {
    return null;
  }
  const rows = await query<{ workspace_id: string }>(
    `SELECT workspace_id
     FROM workspace_settings
     WHERE key = $1 AND value = $2
     LIMIT 1`,
    [KEYS.widgetId, widgetId]
  );
  return rows[0]?.workspace_id ?? null;
}

export async function getPublicWebChatConfig(widgetId: string): Promise<{
  workspaceId: string;
  settings: WebChatSettings;
} | null> {
  const workspaceId = await findWorkspaceIdByWidgetId(widgetId);
  if (!workspaceId) {
    return null;
  }
  const settings = await getWorkspaceWebChatSettings(workspaceId);
  if (!settings || !settings.enabled) {
    return null;
  }
  return { workspaceId, settings };
}
