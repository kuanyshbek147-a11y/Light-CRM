import "../load-env";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { finalizeEmbeddedSignupConnection } from "../modules/integrations/whatsapp/embedded-signup";
import { query } from "../db";
import { saveWorkspaceMetaCredentials } from "../modules/integrations/whatsapp/workspace-meta";
import { ensureMetaPhoneRegistered, subscribeMetaAppWebhook } from "../modules/integrations/whatsapp/meta-cloud";
import { subscribeWabaToApp } from "../modules/integrations/whatsapp/embedded-signup";

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "1156181627586132";
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || process.argv[2] || "https://light-crm-backend.onrender.com").replace(
  /\/+$/,
  ""
);

async function debugToken(accessToken: string): Promise<Record<string, unknown>> {
  const appId = process.env.WHATSAPP_APP_ID || process.env.META_APP_ID || "";
  const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || "";
  const response = await fetch(
    `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v21.0"}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`
  );
  return (await response.json()) as Record<string, unknown>;
}

function extractWabaIds(debugPayload: Record<string, unknown>): string[] {
  const data = debugPayload.data;
  if (!data || typeof data !== "object") {
    return [];
  }
  const granularScopes = (data as Record<string, unknown>).granular_scopes;
  if (!Array.isArray(granularScopes)) {
    return [];
  }
  const ids = new Set<string>();
  for (const entry of granularScopes) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const targetIds = (entry as Record<string, unknown>).target_ids;
    if (!Array.isArray(targetIds)) {
      continue;
    }
    for (const id of targetIds) {
      if (typeof id === "string" && id.trim()) {
        ids.add(id.trim());
      }
    }
  }
  return [...ids];
}

async function resolveWabaId(accessToken: string, hints: string[]): Promise<string> {
  if (hints.length === 1) {
    return hints[0];
  }
  if (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) {
    return process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  }
  for (const wabaId of hints) {
    const response = await fetch(
      `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v21.0"}/${wabaId}/phone_numbers?fields=id&access_token=${encodeURIComponent(accessToken)}`
    );
    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    const ids = (payload.data || []).map((row) => row.id).filter(Boolean);
    if (ids.includes(PHONE_NUMBER_ID)) {
      return wabaId;
    }
  }
  if (hints[0]) {
    return hints[0];
  }
  throw new Error("Token has no WABA access. Assign WhatsApp account Light CRM to system user nn and regenerate token.");
}

async function updateSecretsFile(accessToken: string, wabaId: string): Promise<void> {
  const secretsPath = path.join(__dirname, "../../../infra/meta.secrets.env");
  let content = await readFile(secretsPath, "utf8");
  const updates: Record<string, string> = {
    WHATSAPP_ACCESS_TOKEN: accessToken,
    WHATSAPP_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
    WHATSAPP_BUSINESS_ACCOUNT_ID: wabaId,
    PUBLIC_BASE_URL: PUBLIC_BASE
  };
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(content)) {
      content = content.replace(pattern, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  await writeFile(secretsPath, content.trimEnd() + "\n", "utf8");
}

async function main(): Promise<void> {
  const accessToken = (process.argv[3] || process.env.META_TOKEN_INPUT || "").trim();
  if (!accessToken) {
    throw new Error("Usage: npm run apply:meta-token -- <public-base-url> <access-token>");
  }

  const debug = await debugToken(accessToken);
  const data = debug.data as Record<string, unknown> | undefined;
  if (!data?.is_valid) {
    throw new Error(`Token invalid: ${JSON.stringify(debug)}`);
  }

  const wabaHints = extractWabaIds(debug);
  const wabaId = await resolveWabaId(accessToken, wabaHints);

  await updateSecretsFile(accessToken, wabaId);
  await subscribeWabaToApp(wabaId, accessToken);

  const config = {
    accessToken,
    phoneNumberId: PHONE_NUMBER_ID,
    appId: process.env.WHATSAPP_APP_ID || process.env.META_APP_ID || "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    appSecret: process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || "",
    apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0"
  };

  const { phone, registered } = await ensureMetaPhoneRegistered(config);
  await subscribeMetaAppWebhook(`${PUBLIC_BASE}/api/integrations/whatsapp/webhook`);

  const workspaces = await query<{ id: string }>("SELECT id FROM workspaces ORDER BY id ASC LIMIT 1");
  const workspaceId = workspaces[0]?.id;
  if (!workspaceId) {
    throw new Error("No workspace found");
  }

  await saveWorkspaceMetaCredentials(workspaceId, {
    accessToken,
    phoneNumberId: PHONE_NUMBER_ID,
    wabaId
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        workspaceId,
        wabaId,
        phoneNumberId: PHONE_NUMBER_ID,
        registered,
        phone,
        publicBase: PUBLIC_BASE,
        tokenType: data.type,
        wabaHints
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
