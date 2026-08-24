import assert from "assert";
import { extractPhoneNumberIdFromPayload } from "../modules/integrations/whatsapp/meta-cloud";
import { isLegacyChannelFallbackForced } from "../modules/platform/tenant-routing";

function run(): void {
  const phoneId = extractPhoneNumberIdFromPayload({
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            value: {
              metadata: { phone_number_id: "119437191247523", display_phone_number: "+7700" },
              messages: []
            }
          }
        ]
      }
    ]
  });
  assert.strictEqual(phoneId, "119437191247523");
  assert.strictEqual(extractPhoneNumberIdFromPayload({ entry: [] }), null);

  const prev = process.env.ALLOW_LEGACY_CHANNEL_FALLBACK;
  process.env.ALLOW_LEGACY_CHANNEL_FALLBACK = "1";
  assert.strictEqual(isLegacyChannelFallbackForced(), true);
  process.env.ALLOW_LEGACY_CHANNEL_FALLBACK = "0";
  assert.strictEqual(isLegacyChannelFallbackForced(), false);
  if (prev === undefined) {
    delete process.env.ALLOW_LEGACY_CHANNEL_FALLBACK;
  } else {
    process.env.ALLOW_LEGACY_CHANNEL_FALLBACK = prev;
  }

  console.log("tenant_routing_ok");
}

run();
