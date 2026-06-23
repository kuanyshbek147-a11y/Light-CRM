import "../load-env";
import { query } from "../db";
import { subscribeMetaAppWebhook } from "../modules/integrations/whatsapp/meta-cloud";
import { subscribeWabaToApp } from "../modules/integrations/whatsapp/embedded-signup";
import { saveWorkspaceMetaCredentials } from "../modules/integrations/whatsapp/workspace-meta";

async function main(): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
  const publicBase = (process.env.PUBLIC_BASE_URL || process.argv[2] || "").replace(/\/+$/, "");

  if (!accessToken || !phoneNumberId || !wabaId) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_BUSINESS_ACCOUNT_ID");
  }

  const workspaces = await query<{ id: string }>("SELECT id FROM workspaces ORDER BY id ASC LIMIT 1");
  const workspaceId = workspaces[0]?.id;
  if (!workspaceId) {
    throw new Error("No workspace found");
  }

  await saveWorkspaceMetaCredentials(workspaceId, {
    accessToken,
    phoneNumberId,
    wabaId
  });

  await subscribeWabaToApp(wabaId, accessToken);

  let webhookSubscribed = false;
  if (publicBase) {
    await subscribeMetaAppWebhook(`${publicBase}/api/integrations/whatsapp/webhook`);
    webhookSubscribed = true;
  }

  const token = accessToken;
  const phoneResponse = await fetch(
    `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v21.0"}/${phoneNumberId}?fields=id,display_phone_number,status,platform_type,is_on_biz_app`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const phone = await phoneResponse.json();

  console.log(
    JSON.stringify(
      {
        ok: true,
        workspaceId,
        wabaId,
        phoneNumberId,
        webhookSubscribed,
        publicBase: publicBase || null,
        phone
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
