import assert from "node:assert/strict";
import test from "node:test";
import { resolveBackupFile } from "../modules/ops/backup";

test("скачать можно только файл копии, без выхода из папки", () => {
  assert.ok(resolveBackupFile("light-crm-2026-09-25T07-00-00-000Z.sql")?.endsWith("light-crm-2026-09-25T07-00-00-000Z.sql"));
  assert.ok(resolveBackupFile("light-crm-2026-09-25T07-00-00-000Z.jsonl"));
  assert.equal(resolveBackupFile("../.env"), null);
  assert.equal(resolveBackupFile("light-crm-../../etc/passwd"), null);
  assert.equal(resolveBackupFile("other.sql"), null);
});
