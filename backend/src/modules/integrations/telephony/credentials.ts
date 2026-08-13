import { encryptSecret, decryptSecret } from "../email/secretCrypto";
import { query } from "../../../db";

const KEYS = {
  enabled: "sip_enabled",
  wssUrl: "sip_wss_url",
  domain: "sip_domain",
  iceServers: "sip_ice_servers",
  outboundPrefix: "sip_outbound_prefix"
} as const;

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type TelephonySettings = {
  enabled: boolean;
  wssUrl: string;
  domain: string;
  iceServers: IceServerConfig[];
  outboundPrefix: string;
};

export type TelephonyExtension = {
  id: string;
  workspace_id: string;
  user_id: string;
  sip_username: string;
  display_name: string;
  is_active: boolean;
  user_name?: string | null;
  user_role?: string | null;
  has_password: boolean;
  updated_at: string;
};

const DEFAULT_ICE: IceServerConfig[] = [{ urls: "stun:stun.l.google.com:19302" }];

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

function parseIceServers(raw: string | null): IceServerConfig[] {
  if (!raw) {
    return DEFAULT_ICE;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.length) {
      return DEFAULT_ICE;
    }
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const row = item as Record<string, unknown>;
        const urls = row.urls;
        if (typeof urls !== "string" && !Array.isArray(urls)) {
          return null;
        }
        const server: IceServerConfig = {
          urls: Array.isArray(urls) ? urls.map(String) : String(urls)
        };
        if (typeof row.username === "string" && row.username) {
          server.username = row.username;
        }
        if (typeof row.credential === "string" && row.credential) {
          server.credential = row.credential;
        }
        return server;
      })
      .filter((item): item is IceServerConfig => Boolean(item));
  } catch {
    return DEFAULT_ICE;
  }
}

export async function getTelephonySettings(workspaceId: string): Promise<TelephonySettings> {
  const [enabled, wssUrl, domain, iceServers, outboundPrefix] = await Promise.all([
    getSetting(workspaceId, KEYS.enabled),
    getSetting(workspaceId, KEYS.wssUrl),
    getSetting(workspaceId, KEYS.domain),
    getSetting(workspaceId, KEYS.iceServers),
    getSetting(workspaceId, KEYS.outboundPrefix)
  ]);

  return {
    enabled: enabled === "1" || enabled === "true",
    wssUrl: (wssUrl || "").trim(),
    domain: (domain || "").trim(),
    iceServers: parseIceServers(iceServers),
    outboundPrefix: (outboundPrefix || "").trim()
  };
}

export async function saveTelephonySettings(
  workspaceId: string,
  input: Partial<TelephonySettings>
): Promise<TelephonySettings> {
  const current = await getTelephonySettings(workspaceId);
  const next: TelephonySettings = {
    enabled: input.enabled ?? current.enabled,
    wssUrl: String(input.wssUrl ?? current.wssUrl).trim(),
    domain: String(input.domain ?? current.domain).trim(),
    iceServers: Array.isArray(input.iceServers) ? input.iceServers : current.iceServers,
    outboundPrefix: String(input.outboundPrefix ?? current.outboundPrefix).trim()
  };

  if (next.wssUrl && !/^wss:\/\//i.test(next.wssUrl)) {
    throw new Error("WSS URL must start with wss://");
  }

  await Promise.all([
    setSetting(workspaceId, KEYS.enabled, next.enabled ? "1" : "0"),
    setSetting(workspaceId, KEYS.wssUrl, next.wssUrl),
    setSetting(workspaceId, KEYS.domain, next.domain),
    setSetting(workspaceId, KEYS.iceServers, JSON.stringify(next.iceServers.length ? next.iceServers : DEFAULT_ICE)),
    setSetting(workspaceId, KEYS.outboundPrefix, next.outboundPrefix)
  ]);

  return next;
}

export async function listTelephonyExtensions(workspaceId: string): Promise<TelephonyExtension[]> {
  const rows = await query<{
    id: string;
    workspace_id: string;
    user_id: string;
    sip_username: string;
    display_name: string;
    is_active: boolean;
    user_name: string | null;
    user_role: string | null;
    sip_password_enc: string;
    updated_at: string;
  }>(
    `SELECT te.id, te.workspace_id, te.user_id, te.sip_username, te.display_name, te.is_active,
            te.sip_password_enc, te.updated_at::text AS updated_at,
            u.full_name AS user_name, u.role AS user_role
     FROM telephony_extensions te
     JOIN users u ON u.id = te.user_id
     WHERE te.workspace_id = $1
     ORDER BY u.full_name ASC`,
    [workspaceId]
  );

  return rows.map((row) => ({
    id: row.id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    sip_username: row.sip_username,
    display_name: row.display_name,
    is_active: row.is_active,
    user_name: row.user_name,
    user_role: row.user_role,
    has_password: Boolean(row.sip_password_enc),
    updated_at: row.updated_at
  }));
}

export async function upsertTelephonyExtension(input: {
  workspaceId: string;
  userId: string;
  sipUsername: string;
  sipPassword?: string;
  displayName?: string;
  isActive?: boolean;
}): Promise<TelephonyExtension> {
  const sipUsername = input.sipUsername.trim();
  if (!sipUsername) {
    throw new Error("sip_username_required");
  }

  const user = await query<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM users
     WHERE id = $1 AND workspace_id = $2 AND is_active = true
     LIMIT 1`,
    [input.userId, input.workspaceId]
  );
  if (!user[0]) {
    throw new Error("user_not_found");
  }

  const existing = await query<{ id: string; sip_password_enc: string }>(
    `SELECT id, sip_password_enc FROM telephony_extensions
     WHERE workspace_id = $1 AND user_id = $2
     LIMIT 1`,
    [input.workspaceId, input.userId]
  );

  const password = String(input.sipPassword || "").trim();
  if (!existing[0] && !password) {
    throw new Error("sip_password_required");
  }

  const passwordEnc = password
    ? encryptSecret(password)
    : existing[0]?.sip_password_enc || encryptSecret("");

  const displayName = (input.displayName || user[0].full_name || sipUsername).trim();
  const isActive = input.isActive !== false;

  const rows = await query<{
    id: string;
    workspace_id: string;
    user_id: string;
    sip_username: string;
    display_name: string;
    is_active: boolean;
    updated_at: string;
  }>(
    `INSERT INTO telephony_extensions (
       workspace_id, user_id, sip_username, sip_password_enc, display_name, is_active
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workspace_id, user_id) DO UPDATE
     SET sip_username = EXCLUDED.sip_username,
         sip_password_enc = CASE
           WHEN $7::text = '' THEN telephony_extensions.sip_password_enc
           ELSE EXCLUDED.sip_password_enc
         END,
         display_name = EXCLUDED.display_name,
         is_active = EXCLUDED.is_active,
         updated_at = now()
     RETURNING id, workspace_id, user_id, sip_username, display_name, is_active, updated_at::text`,
    [
      input.workspaceId,
      input.userId,
      sipUsername,
      passwordEnc,
      displayName,
      isActive,
      password
    ]
  );

  return {
    ...rows[0],
    user_name: user[0].full_name,
    has_password: true
  };
}

export async function deleteTelephonyExtension(workspaceId: string, extensionId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM telephony_extensions
     WHERE id = $1 AND workspace_id = $2
     RETURNING id`,
    [extensionId, workspaceId]
  );
  return Boolean(rows[0]);
}

export async function getUserTelephonySession(
  workspaceId: string,
  userId: string
): Promise<{
  enabled: boolean;
  configured: boolean;
  wssUrl: string;
  domain: string;
  iceServers: IceServerConfig[];
  outboundPrefix: string;
  extension: {
    sipUsername: string;
    sipPassword: string;
    displayName: string;
  } | null;
}> {
  const settings = await getTelephonySettings(workspaceId);
  const rows = await query<{
    sip_username: string;
    sip_password_enc: string;
    display_name: string;
    is_active: boolean;
  }>(
    `SELECT sip_username, sip_password_enc, display_name, is_active
     FROM telephony_extensions
     WHERE workspace_id = $1 AND user_id = $2
     LIMIT 1`,
    [workspaceId, userId]
  );

  const extensionRow = rows[0];
  const configured = Boolean(
    settings.enabled && settings.wssUrl && settings.domain && extensionRow?.is_active
  );

  let extension: {
    sipUsername: string;
    sipPassword: string;
    displayName: string;
  } | null = null;

  if (extensionRow?.is_active && settings.enabled) {
    extension = {
      sipUsername: extensionRow.sip_username,
      sipPassword: decryptSecret(extensionRow.sip_password_enc),
      displayName: extensionRow.display_name || extensionRow.sip_username
    };
  }

  return {
    enabled: settings.enabled,
    configured,
    wssUrl: settings.wssUrl,
    domain: settings.domain,
    iceServers: settings.iceServers,
    outboundPrefix: settings.outboundPrefix,
    extension
  };
}

export function normalizePhoneDigits(phone: string): string {
  return String(phone || "").replace(/\D+/g, "");
}

export function applyOutboundPrefix(number: string, prefix: string): string {
  const digits = normalizePhoneDigits(number);
  const cleanPrefix = normalizePhoneDigits(prefix);
  if (!cleanPrefix || digits.startsWith(cleanPrefix)) {
    return digits;
  }
  return `${cleanPrefix}${digits}`;
}
