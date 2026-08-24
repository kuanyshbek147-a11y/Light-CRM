import assert from "assert";
import {
  buildTrafficTargeting,
  hashPhoneForMeta,
  mapMetaEffectiveStatus,
  minCustomAudienceSize,
  toMetaDailyBudgetCents
} from "../modules/ads/meta-marketing";

function run(): void {
  assert.strictEqual(hashPhoneForMeta("+7 700 313 10 55")?.length, 64);
  assert.strictEqual(hashPhoneForMeta("87003131055")?.length, 64);
  assert.strictEqual(hashPhoneForMeta("87003131055"), hashPhoneForMeta("77003131055"));
  assert.strictEqual(hashPhoneForMeta("abc"), null);
  assert.strictEqual(hashPhoneForMeta("123"), null);

  const tiny = buildTrafficTargeting({
    audienceId: "120251005406200623",
    audienceSize: 3,
    country: "kz"
  });
  assert.deepStrictEqual((tiny.geo_locations as { countries: string[] }).countries, ["KZ"]);
  assert.strictEqual(tiny.age_min, 25);
  assert.strictEqual(tiny.age_max, 55);
  assert.ok(Array.isArray((tiny.flexible_spec as Array<{ interests: unknown[] }>)[0].interests));
  assert.ok((tiny.flexible_spec as Array<{ interests: unknown[] }>)[0].interests.length >= 4);
  assert.strictEqual(tiny.custom_audiences, undefined);
  assert.deepStrictEqual(tiny.targeting_automation, { advantage_audience: 0 });

  const large = buildTrafficTargeting({
    audienceId: "120251005406200623",
    audienceSize: Math.max(minCustomAudienceSize(), 100),
    country: "KZ"
  });
  assert.deepStrictEqual(large.custom_audiences, [{ id: "120251005406200623" }]);

  assert.strictEqual(toMetaDailyBudgetCents(5, "USD"), 500);
  assert.strictEqual(toMetaDailyBudgetCents(5000, "KZT"), 1000); // 5000/500 → $10
  assert.deepStrictEqual(toMetaDailyBudgetCents(0.5, "USD"), { error: "budget_too_low" });
  // Old bug: 5000 KZT treated as $5000 → 500000 cents
  assert.notStrictEqual(toMetaDailyBudgetCents(5000, "KZT"), 500000);

  assert.strictEqual(mapMetaEffectiveStatus("ACTIVE"), "active");
  assert.strictEqual(mapMetaEffectiveStatus("PAUSED"), "paused");
  assert.strictEqual(mapMetaEffectiveStatus("CAMPAIGN_PAUSED"), "paused");
  assert.strictEqual(mapMetaEffectiveStatus("PENDING_REVIEW"), "pending_review");
  assert.strictEqual(mapMetaEffectiveStatus("DISAPPROVED"), "failed");

  console.log("ads_targeting_ok");
}

run();
