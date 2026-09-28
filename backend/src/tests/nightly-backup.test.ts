import assert from "node:assert/strict";
import test from "node:test";
import { backupsToPrune, needsNewBackup } from "../modules/ops/nightly-backup";

const hour = 60 * 60 * 1000;

test("новая копия нужна, если копий нет или последней больше 23 часов", () => {
  const now = Date.UTC(2026, 8, 28, 12);
  assert.equal(needsNewBackup([], now), true);
  assert.equal(needsNewBackup([{ lastModified: new Date(now - 2 * hour) }], now), false);
  assert.equal(needsNewBackup([{ lastModified: new Date(now - 24 * hour) }], now), true);
});

test("храним самые свежие, удаляем старые", () => {
  const items = [1, 5, 3, 2, 4].map((day) => ({ key: `d${day}`, lastModified: new Date(Date.UTC(2026, 8, day)) }));
  assert.deepEqual(
    backupsToPrune(items, 3).map((item) => item.key),
    ["d2", "d1"]
  );
  assert.deepEqual(backupsToPrune(items, 10), []);
});
