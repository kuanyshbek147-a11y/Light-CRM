import assert from "node:assert/strict";
import test from "node:test";
import { orderTablesByDependencies, parseJsonlBackup } from "../scripts/restore-jsonl-backup";

test("разбор копии: таблицы, строки, пропущенные таблицы и комментарии", () => {
  const text = [
    "-- Light CRM data backup 2026-09-28T00:00:00.000Z",
    "-- TABLE contacts",
    '{"id":"a","name":"Айгерим"}',
    "",
    "-- TABLE broken skipped",
    "-- TABLE users",
    '{"id":"u1"}',
    '{"id":"u2"}',
    "-- TABLE empty",
    ""
  ].join("\n");
  assert.deepEqual(parseJsonlBackup(text), [
    { name: "contacts", rows: [{ id: "a", name: "Айгерим" }] },
    { name: "users", rows: [{ id: "u1" }, { id: "u2" }] },
    { name: "empty", rows: [] }
  ]);
});

test("строка данных без заголовка таблицы — ошибка", () => {
  assert.throws(() => parseJsonlBackup('{"id":1}\n'));
});

test("сначала таблицы, на которые ссылаются другие", () => {
  const order = orderTablesByDependencies(
    ["messages", "conversations", "contacts", "workspaces", "tree"],
    [
      { from: "messages", to: "conversations" },
      { from: "conversations", to: "contacts" },
      { from: "contacts", to: "workspaces" },
      { from: "messages", to: "workspaces" },
      { from: "tree", to: "tree" },
      { from: "messages", to: "not_in_backup" }
    ]
  );
  assert.equal(order.length, 5);
  const before = (a: string, b: string) => assert.ok(order.indexOf(a) < order.indexOf(b), `${a} раньше ${b}`);
  before("workspaces", "contacts");
  before("contacts", "conversations");
  before("conversations", "messages");
});
