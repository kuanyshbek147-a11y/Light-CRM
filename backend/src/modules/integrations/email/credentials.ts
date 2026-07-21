import { query } from "../../../db";
import { decryptSecret, encryptSecret } from "./secretCrypto";

export type EmailProvider = "gmail" | "yandex" | "mailru" | "outlook" | "custom";

export type EmailCredentials = {
  email: string;
  displayName: string;
  provider: EmailProvider;
  password: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  connectedAt: string;
};

const KEYS = {
  email: "email_address",
  displayName: "email_display_name",
  provider: "email_provider",
  password: "email_password",
  smtpHost: "email_smtp_host",
  smtpPort: "email_smtp_port",
  smtpSecure: "email_smtp_secure",
  imapHost: "email_imap_host",
  imapPort: "email_imap_port",
  imapSecure: "email_imap_secure",
  connectedAt: "email_connected_at",
  disabled: "email_disabled",
  lastUid: "email_last_uid"
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

export async function isEmailDisabledForWorkspace(workspaceId: string): Promise<boolean> {
  const value = await getSetting(workspaceId, KEYS.disabled);
  return value === "1" || value === "true";
}

export async function setEmailDisabledForWorkspace(
  workspaceId: string,
  disabled: boolean
): Promise<void> {
  if (disabled) {
    await setSetting(workspaceId, KEYS.disabled, "1");
    return;
  }
  await query(`DELETE FROM workspace_settings WHERE workspace_id = $1 AND key = $2`, [
    workspaceId,
    KEYS.disabled
  ]);
}

export async function getWorkspaceEmailCredentials(
  workspaceId: string
): Promise<EmailCredentials | null> {
  const [
    email,
    displayName,
    provider,
    passwordEncrypted,
    smtpHost,
    smtpPort,
    smtpSecure,
    imapHost,
    imapPort,
    imapSecure,
    connectedAt
  ] = await Promise.all([
    getSetting(workspaceId, KEYS.email),
    getSetting(workspaceId, KEYS.displayName),
    getSetting(workspaceId, KEYS.provider),
    getSetting(workspaceId, KEYS.password),
    getSetting(workspaceId, KEYS.smtpHost),
    getSetting(workspaceId, KEYS.smtpPort),
    getSetting(workspaceId, KEYS.smtpSecure),
    getSetting(workspaceId, KEYS.imapHost),
    getSetting(workspaceId, KEYS.imapPort),
    getSetting(workspaceId, KEYS.imapSecure),
    getSetting(workspaceId, KEYS.connectedAt)
  ]);

  if (!email || !passwordEncrypted || !smtpHost || !imapHost) {
    return null;
  }

  let password: string;
  try {
    password = decryptSecret(passwordEncrypted);
  } catch (error) {
    console.error(`Failed to decrypt email password for workspace ${workspaceId}`, error);
    return null;
  }

  // Migrate legacy plaintext passwords to encrypted form.
  if (!passwordEncrypted.startsWith("enc:v1:")) {
    try {
      await setSetting(workspaceId, KEYS.password, encryptSecret(password));
    } catch (error) {
      console.error(`Failed to re-encrypt email password for workspace ${workspaceId}`, error);
    }
  }

  return {
    email,
    displayName: displayName || email,
    provider: ((provider || "custom") as EmailProvider) || "custom",
    password,
    smtpHost,
    smtpPort: Number(smtpPort || 465),
    smtpSecure: smtpSecure !== "0" && smtpSecure !== "false",
    imapHost,
    imapPort: Number(imapPort || 993),
    imapSecure: imapSecure !== "0" && imapSecure !== "false",
    connectedAt: connectedAt || new Date().toISOString()
  };
}

export async function getEmailCredentialsForWorkspace(
  workspaceId: string
): Promise<EmailCredentials | null> {
  if (await isEmailDisabledForWorkspace(workspaceId)) {
    return null;
  }
  return getWorkspaceEmailCredentials(workspaceId);
}

export async function saveWorkspaceEmailCredentials(
  workspaceId: string,
  credentials: Omit<EmailCredentials, "connectedAt"> & { connectedAt?: string }
): Promise<void> {
  const connectedAt = credentials.connectedAt || new Date().toISOString();
  await Promise.all([
    setSetting(workspaceId, KEYS.email, credentials.email),
    setSetting(workspaceId, KEYS.displayName, credentials.displayName || credentials.email),
    setSetting(workspaceId, KEYS.provider, credentials.provider),
    setSetting(workspaceId, KEYS.password, encryptSecret(credentials.password)),
    setSetting(workspaceId, KEYS.smtpHost, credentials.smtpHost),
    setSetting(workspaceId, KEYS.smtpPort, String(credentials.smtpPort)),
    setSetting(workspaceId, KEYS.smtpSecure, credentials.smtpSecure ? "1" : "0"),
    setSetting(workspaceId, KEYS.imapHost, credentials.imapHost),
    setSetting(workspaceId, KEYS.imapPort, String(credentials.imapPort)),
    setSetting(workspaceId, KEYS.imapSecure, credentials.imapSecure ? "1" : "0"),
    setSetting(workspaceId, KEYS.connectedAt, connectedAt),
    setEmailDisabledForWorkspace(workspaceId, false)
  ]);
}

export async function clearWorkspaceEmailCredentials(workspaceId: string): Promise<void> {
  await query(
    `DELETE FROM workspace_settings
     WHERE workspace_id = $1
       AND key = ANY($2::text[])`,
    [
      workspaceId,
      [
        KEYS.email,
        KEYS.displayName,
        KEYS.provider,
        KEYS.password,
        KEYS.smtpHost,
        KEYS.smtpPort,
        KEYS.smtpSecure,
        KEYS.imapHost,
        KEYS.imapPort,
        KEYS.imapSecure,
        KEYS.connectedAt,
        KEYS.lastUid
      ]
    ]
  );
  await setEmailDisabledForWorkspace(workspaceId, true);
}

export async function getEmailLastUid(workspaceId: string): Promise<number> {
  const value = await getSetting(workspaceId, KEYS.lastUid);
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function setEmailLastUid(workspaceId: string, uid: number): Promise<void> {
  await setSetting(workspaceId, KEYS.lastUid, String(uid));
}

export async function listWorkspacesWithEmail(): Promise<string[]> {
  const rows = await query<{ workspace_id: string }>(
    `SELECT DISTINCT ws.workspace_id
     FROM workspace_settings ws
     WHERE ws.key = $1
       AND NOT EXISTS (
         SELECT 1
         FROM workspace_settings d
         WHERE d.workspace_id = ws.workspace_id
           AND d.key = $2
           AND d.value IN ('1', 'true')
       )`,
    [KEYS.email, KEYS.disabled]
  );
  return rows.map((row) => row.workspace_id);
}
