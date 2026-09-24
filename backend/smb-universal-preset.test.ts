import assert from "node:assert/strict";
import test from "node:test";
import {
  SMB_UNIVERSAL_LANDING,
  SMB_UNIVERSAL_SCRIPTS,
  SMB_UNIVERSAL_STAGES
} from "./src/modules/presets/smb-universal.ts";

test("новая компания получает нейтральные этапы малого бизнеса", () => {
  assert.deepEqual(
    SMB_UNIVERSAL_STAGES.map((stage) => stage.name),
    ["Новая заявка", "В работе", "Счёт или предложение", "Успешно", "Отказ"]
  );
  assert.equal(SMB_UNIVERSAL_STAGES.filter((stage) => stage.outcome === "won").length, 1);
  assert.equal(SMB_UNIVERSAL_STAGES.filter((stage) => stage.outcome === "lost").length, 1);
  const text = [
    ...SMB_UNIVERSAL_STAGES.map((stage) => stage.name),
    ...SMB_UNIVERSAL_SCRIPTS.map((script) => `${script.title} ${script.body}`),
    SMB_UNIVERSAL_LANDING.title,
    SMB_UNIVERSAL_LANDING.headline,
    SMB_UNIVERSAL_LANDING.body
  ].join("\n");
  assert.equal(/недвижим|показ|ипотек/i.test(text), false);
});
