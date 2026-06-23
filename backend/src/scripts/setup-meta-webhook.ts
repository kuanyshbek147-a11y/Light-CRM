import "../load-env";
import {
  getMetaCloudConfig,
  getMetaCloudMissing,
  getMetaWebhookSubscriptions,
  subscribeMetaWebhook,
  validateMetaCloudConnection
} from "../modules/integrations/whatsapp/meta-cloud";

const PUBLIC_BASE_URL = (process.argv[2] || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");

async function main(): Promise<void> {
  const config = getMetaCloudConfig();
  const missing = getMetaCloudMissing(config);
  if (missing.length) {
    throw new Error(`Missing Meta WhatsApp env: ${missing.join(", ")}`);
  }
  if (!PUBLIC_BASE_URL) {
    throw new Error(
      "Pass public HTTPS base URL: npm run -w backend setup:whatsapp-meta -- https://your-domain.com"
    );
  }

  const webhookUrl = `${PUBLIC_BASE_URL}/api/integrations/whatsapp/webhook`;
  const phone = await validateMetaCloudConnection();
  const subscribeResult = await subscribeMetaWebhook(webhookUrl);
  const subscriptions = await getMetaWebhookSubscriptions();

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: "meta",
        webhookUrl,
        verifyToken: config?.verifyToken || null,
        phone,
        subscribeResult,
        subscriptions
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
