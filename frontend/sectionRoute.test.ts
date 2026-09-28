import assert from "node:assert/strict";
import test from "node:test";
import { canOpenSection, parseSectionHash, sectionHash } from "./src/shared/lib/sectionRoute.ts";

test("раздел читается из адреса и записывается обратно", () => {
  assert.equal(parseSectionHash("#/tasks"), "tasks");
  assert.equal(parseSectionHash("#/analytics/"), "analytics");
  assert.equal(parseSectionHash(sectionHash("knowledge")), "knowledge");
});

test("якоря лендинга и мусор в адресе не открывают разделы", () => {
  assert.equal(parseSectionHash("#workspace-login"), null);
  assert.equal(parseSectionHash("#/unknown"), null);
  assert.equal(parseSectionHash(""), null);
});

test("разделы администратора не открываются оператору по ссылке", () => {
  assert.equal(canOpenSection("ops", "manager"), false);
  assert.equal(canOpenSection("integrations", "admin"), true);
  assert.equal(canOpenSection("platform", "admin"), false);
  assert.equal(canOpenSection("platform", "superadmin"), true);
  assert.equal(canOpenSection("tasks", "superadmin"), false);
  assert.equal(canOpenSection("tasks", "manager"), true);
});
