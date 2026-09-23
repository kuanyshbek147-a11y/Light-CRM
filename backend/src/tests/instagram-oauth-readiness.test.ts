import assert from "assert";
import { describeInstagramOAuthReadiness } from "../modules/integrations/instagram/graph";

const ENV_KEYS = [
  "INSTAGRAM_APP_ID",
  "META_INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "META_INSTAGRAM_APP_SECRET"
] as const;

function withInstagramEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, run: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value) {
      process.env[key] = value;
    }
  }
  try {
    run();
  } finally {
    for (const key of ENV_KEYS) {
      const prior = previous.get(key);
      if (prior === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prior;
      }
    }
  }
}

function run(): void {
  withInstagramEnv({}, () => {
    const missing = describeInstagramOAuthReadiness();
    assert.strictEqual(missing.credentialsReady, false);
    assert.strictEqual(missing.appId, "");
    assert.strictEqual(missing.appSecretConfigured, false);
    assert.deepStrictEqual(missing.missing, ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"]);
    assert.ok(missing.blockReason);
    assert.match(missing.blockReason, /INSTAGRAM_APP_ID/);
    assert.match(missing.blockReason, /INSTAGRAM_APP_SECRET/);
    assert.match(missing.blockReason, /Ручной ввод токена/);
  });

  withInstagramEnv({ INSTAGRAM_APP_ID: "1522306675935942" }, () => {
    const missingSecret = describeInstagramOAuthReadiness();
    assert.strictEqual(missingSecret.credentialsReady, false);
    assert.strictEqual(missingSecret.appId, "1522306675935942");
    assert.deepStrictEqual(missingSecret.missing, ["INSTAGRAM_APP_SECRET"]);
    assert.match(missingSecret.blockReason || "", /INSTAGRAM_APP_SECRET/);
    assert.doesNotMatch(missingSecret.blockReason || "", /Не заданы/);
  });

  withInstagramEnv({ INSTAGRAM_APP_SECRET: "secret" }, () => {
    const missingId = describeInstagramOAuthReadiness();
    assert.deepStrictEqual(missingId.missing, ["INSTAGRAM_APP_ID"]);
    assert.match(missingId.blockReason || "", /Не задан INSTAGRAM_APP_ID/);
  });

  withInstagramEnv(
    { META_INSTAGRAM_APP_ID: "meta-app", META_INSTAGRAM_APP_SECRET: "meta-secret" },
    () => {
      const ready = describeInstagramOAuthReadiness();
      assert.strictEqual(ready.credentialsReady, true);
      assert.strictEqual(ready.appId, "meta-app");
      assert.strictEqual(ready.appSecretConfigured, true);
      assert.deepStrictEqual(ready.missing, []);
      assert.strictEqual(ready.blockReason, null);
    }
  );

  console.log("instagram_oauth_readiness_ok");
}

run();
