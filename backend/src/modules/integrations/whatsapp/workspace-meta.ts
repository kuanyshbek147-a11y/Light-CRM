import { query } from "../../../db";

export type WorkspaceMetaCredentials = {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  connectedAt: string;
};

const KEYS = {
  accessToken: "whatsapp_meta_access_token",
  phoneNumberId: "whatsapp_meta_phone_number_id",
  wabaId: "whatsapp_meta_waba_id",
  connectedAt: "whatsapp_meta_connected_at"
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

export async function getWorkspaceMetaCredentials(
  workspaceId: string
): Promise<WorkspaceMetaCredentials | null> {
  const [accessToken, phoneNumberId, wabaId, connectedAt] = await Promise.all([
    getSetting(workspaceId, KEYS.accessToken),
    getSetting(workspaceId, KEYS.phoneNumberId),
    getSetting(workspaceId, KEYS.wabaId),
    getSetting(workspaceId, KEYS.connectedAt)
  ]);

  if (!accessToken || !phoneNumberId || !wabaId) {
    return null;
  }

  return {
    accessToken,
    phoneNumberId,
    wabaId,
    connectedAt: connectedAt || new Date().toISOString()
  };
}

export async function saveWorkspaceMetaCredentials(
  workspaceId: string,
  credentials: Omit<WorkspaceMetaCredentials, "connectedAt"> & { connectedAt?: string }
): Promise<void> {
  const connectedAt = credentials.connectedAt || new Date().toISOString();
  await Promise.all([
    setSetting(workspaceId, KEYS.accessToken, credentials.accessToken),
    setSetting(workspaceId, KEYS.phoneNumberId, credentials.phoneNumberId),
    setSetting(workspaceId, KEYS.wabaId, credentials.wabaId),
    setSetting(workspaceId, KEYS.connectedAt, connectedAt)
  ]);
}

export async function clearWorkspaceMetaCredentials(workspaceId: string): Promise<void> {
  await query(
    `DELETE FROM workspace_settings
     WHERE workspace_id = $1
       AND key = ANY($2::text[])`,
    [workspaceId, [KEYS.accessToken, KEYS.phoneNumberId, KEYS.wabaId, KEYS.connectedAt]]
  );
}

export async function findWorkspaceIdByWabaId(wabaId: string): Promise<string | null> {
  const rows = await query<{ workspace_id: string }>(
    `SELECT workspace_id
     FROM workspace_settings
     WHERE key = $1 AND value = $2
     LIMIT 1`,
    [KEYS.wabaId, wabaId]
  );
  return rows[0]?.workspace_id ?? null;
}

export async function findWorkspaceIdByPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  if (!phoneNumberId) {
    return null;
  }
  const rows = await query<{ workspace_id: string }>(
    `SELECT workspace_id
     FROM workspace_settings
     WHERE key = $1 AND value = $2
     LIMIT 1`,
    [KEYS.phoneNumberId, phoneNumberId]
  );
  return rows[0]?.workspace_id ?? null;
}
