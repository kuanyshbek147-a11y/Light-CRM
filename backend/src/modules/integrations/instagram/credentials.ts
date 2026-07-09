import { query } from "../../../db";

export type InstagramCredentials = {
  pageId: string;
  pageAccessToken: string;
  igUserId: string;
  connectedAt: string;
};

const KEYS = {
  pageId: "instagram_page_id",
  pageAccessToken: "instagram_page_access_token",
  igUserId: "instagram_ig_user_id",
  connectedAt: "instagram_connected_at"
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

export function getEnvInstagramCredentials(): InstagramCredentials | null {
  const pageId = process.env.INSTAGRAM_PAGE_ID || "";
  const pageAccessToken = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || "";
  const igUserId = process.env.INSTAGRAM_IG_USER_ID || "";
  if (!pageId || !pageAccessToken) {
    return null;
  }
  return {
    pageId,
    pageAccessToken,
    igUserId,
    connectedAt: new Date().toISOString()
  };
}

export async function getWorkspaceInstagramCredentials(
  workspaceId: string
): Promise<InstagramCredentials | null> {
  const [pageId, pageAccessToken, igUserId, connectedAt] = await Promise.all([
    getSetting(workspaceId, KEYS.pageId),
    getSetting(workspaceId, KEYS.pageAccessToken),
    getSetting(workspaceId, KEYS.igUserId),
    getSetting(workspaceId, KEYS.connectedAt)
  ]);

  if (!pageId || !pageAccessToken) {
    return null;
  }

  return {
    pageId,
    pageAccessToken,
    igUserId: igUserId || "",
    connectedAt: connectedAt || new Date().toISOString()
  };
}

export async function getInstagramCredentialsForWorkspace(
  workspaceId: string
): Promise<InstagramCredentials | null> {
  const workspace = await getWorkspaceInstagramCredentials(workspaceId);
  if (workspace) {
    return workspace;
  }
  return getEnvInstagramCredentials();
}

export async function saveWorkspaceInstagramCredentials(
  workspaceId: string,
  credentials: Omit<InstagramCredentials, "connectedAt"> & { connectedAt?: string }
): Promise<void> {
  const connectedAt = credentials.connectedAt || new Date().toISOString();
  await Promise.all([
    setSetting(workspaceId, KEYS.pageId, credentials.pageId),
    setSetting(workspaceId, KEYS.pageAccessToken, credentials.pageAccessToken),
    setSetting(workspaceId, KEYS.igUserId, credentials.igUserId || ""),
    setSetting(workspaceId, KEYS.connectedAt, connectedAt)
  ]);
}

export async function clearWorkspaceInstagramCredentials(workspaceId: string): Promise<void> {
  await query(
    `DELETE FROM workspace_settings
     WHERE workspace_id = $1
       AND key = ANY($2::text[])`,
    [workspaceId, [KEYS.pageId, KEYS.pageAccessToken, KEYS.igUserId, KEYS.connectedAt]]
  );
}

export async function findWorkspaceIdByInstagramPageId(pageId: string): Promise<string | null> {
  const rows = await query<{ workspace_id: string }>(
    `SELECT workspace_id
     FROM workspace_settings
     WHERE key = $1 AND value = $2
     LIMIT 1`,
    [KEYS.pageId, pageId]
  );
  return rows[0]?.workspace_id ?? null;
}

export async function findWorkspaceIdByInstagramIgUserId(igUserId: string): Promise<string | null> {
  if (!igUserId) {
    return null;
  }
  const rows = await query<{ workspace_id: string }>(
    `SELECT workspace_id
     FROM workspace_settings
     WHERE key = $1 AND value = $2
     LIMIT 1`,
    [KEYS.igUserId, igUserId]
  );
  return rows[0]?.workspace_id ?? null;
}

export function getInstagramApiVersion(): string {
  return process.env.INSTAGRAM_API_VERSION || process.env.WHATSAPP_API_VERSION || "v21.0";
}
