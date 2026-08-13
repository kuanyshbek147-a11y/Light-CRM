import { query } from "../../db";

export type MetaAdsCredentials = {
  accessToken: string;
  adAccountId: string;
  pageId: string;
  connectedAt: string;
};

const KEYS = {
  accessToken: "meta_ads_access_token",
  adAccountId: "meta_ads_ad_account_id",
  pageId: "meta_ads_page_id",
  connectedAt: "meta_ads_connected_at",
  defaultLinkUrl: "meta_ads_default_link_url"
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

function normalizeAdAccountId(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return value.startsWith("act_") ? value : `act_${value.replace(/^act_/i, "")}`;
}

export function getEnvMetaAdsCredentials(): MetaAdsCredentials | null {
  const accessToken = (process.env.META_ADS_ACCESS_TOKEN || "").trim();
  const adAccountId = normalizeAdAccountId(process.env.META_ADS_AD_ACCOUNT_ID || "");
  const pageId = (process.env.META_ADS_PAGE_ID || process.env.INSTAGRAM_PAGE_ID || "").trim();
  if (!accessToken || !adAccountId) {
    return null;
  }
  return {
    accessToken,
    adAccountId,
    pageId,
    connectedAt: new Date().toISOString()
  };
}

export async function getWorkspaceMetaAdsCredentials(
  workspaceId: string
): Promise<MetaAdsCredentials | null> {
  const [accessToken, adAccountId, pageId, connectedAt] = await Promise.all([
    getSetting(workspaceId, KEYS.accessToken),
    getSetting(workspaceId, KEYS.adAccountId),
    getSetting(workspaceId, KEYS.pageId),
    getSetting(workspaceId, KEYS.connectedAt)
  ]);
  if (!accessToken?.trim() || !adAccountId?.trim()) {
    return null;
  }
  return {
    accessToken: accessToken.trim(),
    adAccountId: normalizeAdAccountId(adAccountId),
    pageId: (pageId || "").trim(),
    connectedAt: connectedAt || new Date().toISOString()
  };
}

export async function getMetaAdsCredentialsForWorkspace(
  workspaceId: string
): Promise<MetaAdsCredentials | null> {
  return (await getWorkspaceMetaAdsCredentials(workspaceId)) || getEnvMetaAdsCredentials();
}

export type MetaAdsSettingsPublic = {
  connected: boolean;
  adAccountId: string;
  pageId: string;
  connectedAt: string | null;
  hasToken: boolean;
  defaultLinkUrl: string;
};

export async function getMetaAdsSettingsPublic(workspaceId: string): Promise<MetaAdsSettingsPublic> {
  const [creds, defaultLinkUrl] = await Promise.all([
    getMetaAdsCredentialsForWorkspace(workspaceId),
    getSetting(workspaceId, KEYS.defaultLinkUrl)
  ]);
  return {
    connected: Boolean(creds?.accessToken && creds.adAccountId),
    adAccountId: creds?.adAccountId || "",
    pageId: creds?.pageId || "",
    connectedAt: creds?.connectedAt || null,
    hasToken: Boolean(creds?.accessToken),
    defaultLinkUrl: (defaultLinkUrl || process.env.ADS_DEFAULT_LINK_URL || "").trim()
  };
}

export async function saveMetaAdsCredentials(
  workspaceId: string,
  input: { accessToken?: string; adAccountId?: string; pageId?: string; defaultLinkUrl?: string }
): Promise<MetaAdsSettingsPublic> {
  const onlyDefaultLink =
    input.defaultLinkUrl !== undefined &&
    input.accessToken === undefined &&
    input.adAccountId === undefined &&
    input.pageId === undefined;

  if (onlyDefaultLink) {
    await setSetting(workspaceId, KEYS.defaultLinkUrl, String(input.defaultLinkUrl || "").trim());
    return getMetaAdsSettingsPublic(workspaceId);
  }

  const current = await getWorkspaceMetaAdsCredentials(workspaceId);
  const accessToken = (input.accessToken ?? current?.accessToken ?? "").trim();
  const adAccountId = normalizeAdAccountId(input.adAccountId ?? current?.adAccountId ?? "");
  const pageId = (input.pageId ?? current?.pageId ?? "").trim();

  if (accessToken) {
    await setSetting(workspaceId, KEYS.accessToken, accessToken);
  }
  if (adAccountId) {
    await setSetting(workspaceId, KEYS.adAccountId, adAccountId);
  }
  await setSetting(workspaceId, KEYS.pageId, pageId);
  await setSetting(workspaceId, KEYS.connectedAt, new Date().toISOString());
  if (input.defaultLinkUrl !== undefined) {
    await setSetting(workspaceId, KEYS.defaultLinkUrl, String(input.defaultLinkUrl || "").trim());
  }

  return getMetaAdsSettingsPublic(workspaceId);
}
