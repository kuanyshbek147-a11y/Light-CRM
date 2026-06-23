import "../load-env";
import path from "path";

type JsonRecord = Record<string, unknown>;

const CHATAPP_API_BASE_URL = (process.env.CHATAPP_API_BASE_URL || "https://api.chatapp.online").replace(/\/+$/, "");
let CHATAPP_API_TOKEN = process.env.CHATAPP_API_TOKEN || "";
const CHATAPP_WEBHOOK_SECRET = process.env.CHATAPP_WEBHOOK_SECRET || "lightcrm-whatsapp-webhook-2026";
const PUBLIC_BASE_URL = (process.argv[2] || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");

async function ensureChatAppToken(): Promise<void> {
  if (CHATAPP_API_TOKEN) {
    const probe = await fetch(`${CHATAPP_API_BASE_URL}/v1/licenses`, {
      headers: { Authorization: CHATAPP_API_TOKEN, Lang: "en" }
    });
    if (probe.ok) {
      return;
    }
  }

  const email = process.env.CHATAPP_EMAIL || "";
  const password = process.env.CHATAPP_PASSWORD || "";
  const appId = process.env.CHATAPP_APP_ID || "";
  if (!email || !password || !appId) {
    throw new Error(
      "CHATAPP_API_TOKEN invalid. Update token in infra/.env or set CHATAPP_EMAIL, CHATAPP_PASSWORD, CHATAPP_APP_ID"
    );
  }

  const response = await fetch(`${CHATAPP_API_BASE_URL}/v1/tokens`, {
    method: "POST",
    headers: { Lang: "en", "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password, appId })
  });
  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    throw new Error(`ChatApp token request failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  const data = payload.data as JsonRecord | undefined;
  const accessToken = typeof data?.accessToken === "string" ? data.accessToken : "";
  if (!accessToken) {
    throw new Error("ChatApp token response did not include accessToken");
  }

  CHATAPP_API_TOKEN = accessToken;
  console.log("ChatApp access token refreshed for setup run");
}

async function main(): Promise<void> {
  await ensureChatAppToken();
  if (!PUBLIC_BASE_URL) {
    throw new Error("Pass public HTTPS base URL: npm run -w backend setup:whatsapp -- https://your-tunnel.trycloudflare.com");
  }

  const licenseId = await resolveLicenseId();
  if (!licenseId) {
    throw new Error("WhatsApp license not found in ChatApp account");
  }

  const webhookUrl = `${PUBLIC_BASE_URL}/api/integrations/whatsapp/webhook`;
  const response = await fetch(
    `${CHATAPP_API_BASE_URL}/v1/licenses/${licenseId}/messengers/grWhatsApp/callbackUrl`,
    {
      method: "PUT",
      headers: {
        Authorization: CHATAPP_API_TOKEN,
        Lang: "en",
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        events: ["message", "messageStatus"],
        url: webhookUrl
      })
    }
  );

  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    throw new Error(`ChatApp callbackUrl failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  const statusResponse = await fetch(`${PUBLIC_BASE_URL}/api/integrations/whatsapp/status`);
  const status = (await statusResponse.json()) as JsonRecord;

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: "chatapp",
        licenseId,
        webhookUrl,
        webhookSecretHeader: process.env.CHATAPP_WEBHOOK_SECRET_HEADER || "x-chatapp-secret",
        webhookSecret: CHATAPP_WEBHOOK_SECRET,
        status
      },
      null,
      2
    )
  );
}

async function resolveLicenseId(): Promise<string | null> {
  const explicit = process.env.CHATAPP_LICENSE_ID || "";
  if (explicit) {
    return explicit;
  }

  const response = await fetch(`${CHATAPP_API_BASE_URL}/v1/licenses`, {
    headers: {
      Authorization: CHATAPP_API_TOKEN,
      Lang: "en"
    }
  });
  const payload = (await response.json()) as JsonRecord;
  if (!response.ok) {
    throw new Error(`ChatApp licenses failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  const licenses = Array.isArray(payload.data) ? payload.data : [];
  for (const item of licenses) {
    const record = item as JsonRecord;
    const licenseId = typeof record.licenseId === "string" ? record.licenseId : "";
    const messengers = Array.isArray(record.messenger) ? record.messenger : [];
    const hasWhatsApp = messengers.some((messenger) => {
      const messengerRecord = messenger as JsonRecord;
      return messengerRecord.type === "grWhatsApp";
    });
    if (licenseId && hasWhatsApp) {
      return licenseId;
    }
  }

  return null;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
