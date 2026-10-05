import assert from "node:assert/strict";
import test from "node:test";
import { parseUiMode, readUiMode, sectionForUiMode, UI_MODE_KEY, writeUiMode } from "./src/shared/lib/uiMode.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value)
  };
}

test("по умолчанию открывается полная CRM", () => {
  assert.equal(parseUiMode(null), "full");
  assert.equal(parseUiMode("что-то"), "full");
  assert.equal(readUiMode(memoryStorage()), "full");
  assert.equal(readUiMode(null), "full");
});

test("выбор простого вида сохраняется", () => {
  const storage = memoryStorage();
  writeUiMode(storage, "simple");
  assert.equal(storage.getItem(UI_MODE_KEY), "simple");
  assert.equal(readUiMode(storage), "simple");
  writeUiMode(storage, "full");
  assert.equal(readUiMode(storage), "full");
});

test("недоступное хранилище не ломает кабинет", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    }
  };
  assert.equal(readUiMode(broken), "full");
  assert.doesNotThrow(() => writeUiMode(broken, "simple"));
});

test("в простом виде любой раздел ведёт в чаты", () => {
  assert.equal(sectionForUiMode("simple", "pipeline"), "dialogs");
  assert.equal(sectionForUiMode("simple", "settings"), "dialogs");
  assert.equal(sectionForUiMode("simple", "dialogs"), "dialogs");
  assert.equal(sectionForUiMode("full", "pipeline"), "pipeline");
  assert.equal(sectionForUiMode("simple", "platform"), "platform");
});
