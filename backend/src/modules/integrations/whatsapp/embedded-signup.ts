import type { MetaCloudConfig } from "./meta-cloud";
import { ensureMetaPhoneRegistered, subscribeMetaAppWebhook } from "./meta-cloud";

type JsonRecord = Record<string, unknown>;

export type EmbeddedSignupInput = {
  code: string;
  wabaId?: string;
  phoneNumberId?: string;
  webhookPublicBaseUrl?: string;
};

export type ResolvedEmbeddedSignupAssets = {
  wabaId: string;
  phoneNumberId: string;
};

export type EmbeddedSignupResult = {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  phone: JsonRecord;
  webhookSubscribed: boolean;
  registered: boolean;
};

function platformAppId(): string {
  return process.env.WHATSAPP_APP_ID || process.env.META_APP_ID || "2788233571542840";
}

function platformAppSecret(): string {
  return process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || "";
}

function missingPlatformAppCredentials(): string[] {
  const missing: string[] = [];
  if (!platformAppId()) {
    missing.push("WHATSAPP_APP_ID");
  }
  if (!platformAppSecret()) {
    missing.push("WHATSAPP_APP_SECRET");
  }
  return missing;
}

function apiVersion(): string {
  return process.env.WHATSAPP_API_VERSION || "v21.0";
}

export async function exchangeEmbeddedSignupCode(code: string): Promise<string> {
  const missing = missingPlatformAppCredentials();
  if (missing.length > 0) {
    throw new Error(
      `${missing.join(" and ")} required. Добавьте App Secret в Render → light-crm-backend → Environment.`
    );
  }

  const appId = platformAppId();
  const appSecret = platformAppSecret();

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code
  });

  const response = await fetch(`https://graph.facebook.com/${apiVersion()}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    throw new Error(`Meta token exchange failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!accessToken) {
    throw new Error("Meta token exchange returned empty access_token");
  }

  return accessToken;
}

async function debugAccessToken(accessToken: string): Promise<JsonRecord> {
  const appId = platformAppId();
  const appSecret = platformAppSecret();
  const params = new URLSearchParams({
    input_token: accessToken,
    access_token: `${appId}|${appSecret}`
  });

  const response = await fetch(`https://graph.facebook.com/${apiVersion()}/debug_token?${params.toString()}`);
  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    throw new Error(`Meta debug_token failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

function extractWabaIdsFromDebugToken(debugPayload: JsonRecord): string[] {
  const data = debugPayload.data;
  if (!data || typeof data !== "object") {
    return [];
  }

  const granularScopes = (data as JsonRecord).granular_scopes;
  if (!Array.isArray(granularScopes)) {
    return [];
  }

  const wabaIds = new Set<string>();
  for (const scopeEntry of granularScopes) {
    if (!scopeEntry || typeof scopeEntry !== "object") {
      continue;
    }

    const scopeName = (scopeEntry as JsonRecord).scope;
    if (scopeName !== "whatsapp_business_management" && scopeName !== "whatsapp_business_messaging") {
      continue;
    }

    const targetIds = (scopeEntry as JsonRecord).target_ids;
    if (!Array.isArray(targetIds)) {
      continue;
    }

    for (const targetId of targetIds) {
      if (typeof targetId === "string" && targetId.trim()) {
        wabaIds.add(targetId.trim());
      }
    }
  }

  return [...wabaIds];
}

async function listWabaPhoneNumberIds(wabaId: string, accessToken: string): Promise<string[]> {
  const response = await fetch(
    `https://graph.facebook.com/${apiVersion()}/${wabaId}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`
  );
  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    throw new Error(`Meta phone_numbers failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows
    .map((row) => (row && typeof row === "object" ? (row as JsonRecord).id : null))
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

export async function resolveEmbeddedSignupAssets(
  accessToken: string,
  hints: { wabaId?: string; phoneNumberId?: string } = {}
): Promise<ResolvedEmbeddedSignupAssets> {
  let wabaId = hints.wabaId?.trim() || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || "";
  let phoneNumberId = hints.phoneNumberId?.trim() || process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || "";

  if (wabaId && phoneNumberId) {
    return { wabaId, phoneNumberId };
  }

  const debugPayload = await debugAccessToken(accessToken);
  const discoveredWabaIds = extractWabaIdsFromDebugToken(debugPayload);

  if (!wabaId) {
    if (discoveredWabaIds.length === 1) {
      wabaId = discoveredWabaIds[0];
    } else if (discoveredWabaIds.length > 1 && process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
      wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    } else if (discoveredWabaIds.length > 0) {
      wabaId = discoveredWabaIds[0];
    }
  }

  if (!wabaId) {
    throw new Error("Meta token does not include WABA ID. Complete Embedded Signup until QR step finishes.");
  }

  if (!phoneNumberId) {
    const phoneNumberIds = await listWabaPhoneNumberIds(wabaId, accessToken);
    if (phoneNumberIds.length === 1) {
      phoneNumberId = phoneNumberIds[0];
    } else if (process.env.WHATSAPP_PHONE_NUMBER_ID && phoneNumberIds.includes(process.env.WHATSAPP_PHONE_NUMBER_ID)) {
      phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    } else if (phoneNumberIds.length > 0) {
      phoneNumberId = phoneNumberIds[0];
    }
  }

  if (!phoneNumberId) {
    throw new Error("Meta token does not include Phone Number ID. Завершите мастер Embedded Signup до конца.");
  }

  return { wabaId, phoneNumberId };
}

export async function subscribeWabaToApp(wabaId: string, accessToken: string): Promise<void> {
  const response = await fetch(`https://graph.facebook.com/${apiVersion()}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    throw new Error(`Meta WABA subscribe failed: ${response.status} ${JSON.stringify(payload)}`);
  }
}

export async function finalizeEmbeddedSignupConnection(
  input: EmbeddedSignupInput & { registrationPin?: string }
): Promise<EmbeddedSignupResult> {
  const accessToken = await exchangeEmbeddedSignupCode(input.code);
  const assets = await resolveEmbeddedSignupAssets(accessToken, {
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId
  });
  await subscribeWabaToApp(assets.wabaId, accessToken);

  const config: MetaCloudConfig = {
    accessToken,
    phoneNumberId: assets.phoneNumberId,
    appId: platformAppId(),
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    appSecret: platformAppSecret(),
    apiVersion: apiVersion()
  };

  const { phone, registered } = await ensureMetaPhoneRegistered(config, input.registrationPin);

  let webhookSubscribed = false;
  const publicBase = (input.webhookPublicBaseUrl || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (publicBase) {
    const webhookUrl = `${publicBase}/api/integrations/whatsapp/webhook`;
    await subscribeMetaAppWebhook(webhookUrl);
    webhookSubscribed = true;
  }

  return {
    accessToken,
    wabaId: assets.wabaId,
    phoneNumberId: assets.phoneNumberId,
    phone,
    webhookSubscribed,
    registered
  };
}
