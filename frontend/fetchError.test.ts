import assert from "node:assert/strict";
import test from "node:test";
import { isNetworkFetchError, plainFetchError, SAVE_NETWORK_ERROR } from "./src/shared/api/http.ts";

test("сетевой сбой fetch всегда одна фраза про сохранение", () => {
  const fetchError = new TypeError("Failed to fetch");
  assert.equal(isNetworkFetchError(fetchError), true);
  assert.equal(plainFetchError(fetchError, "Ошибка сохранения"), SAVE_NETWORK_ERROR);
  assert.equal(plainFetchError(new Error("Load failed"), "Ошибка сохранения"), SAVE_NETWORK_ERROR);
  assert.equal(plainFetchError(new Error("Не удалось сохранить учётку"), "Ошибка сохранения"), "Не удалось сохранить учётку");
  assert.equal(plainFetchError(new Error("HTTP 500"), "Ошибка сохранения"), "Ошибка сохранения");
  assert.equal(SAVE_NETWORK_ERROR, "Не удалось сохранить. Проверьте интернет и попробуйте ещё раз.");
});
