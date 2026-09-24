import assert from "node:assert/strict";
import test from "node:test";
import {
  describeTelegramConnectError,
  interpretInstagramOAuthReturn,
  plainWhatsAppOAuthError,
  WHATSAPP_POPUP_BLOCKED,
  resolveLinkBadge,
  telegramTokenMessage,
  telegramTokenProblem
} from "./src/features/integrations/connectionState.ts";

test("отмена OAuth не оставляет бейдж подключённым", () => {
  const badge = resolveLinkBadge({
    serverConnected: true,
    attemptFailed: true,
    dismissedFailure: false,
    connectedLabel: "Подключено"
  });
  assert.equal(badge.kind, "error");
  assert.equal(badge.label, "Ошибка подключения");
});

test("сброс ошибки показывает «Не подключено», пока статус не обновлён", () => {
  const badge = resolveLinkBadge({
    serverConnected: true,
    attemptFailed: false,
    dismissedFailure: true,
    connectedLabel: "Подключён"
  });
  assert.equal(badge.kind, "disconnected");
  assert.equal(badge.label, "Не подключено");
});

test("обновление статуса возвращает реальное подключение", () => {
  const badge = resolveLinkBadge({
    serverConnected: true,
    attemptFailed: false,
    dismissedFailure: false,
    connectedLabel: "Подключено"
  });
  assert.equal(badge.kind, "connected");
  assert.equal(badge.label, "Подключено");
});

test("возврат из Instagram без кода — отмена", () => {
  const cancelled = interpretInstagramOAuthReturn({
    code: null,
    error: "access_denied",
    errorDescription: "The user denied your request",
    pending: true
  });
  assert.equal(cancelled.kind, "cancelled");
  if (cancelled.kind === "cancelled") {
    assert.match(cancelled.message, /отменён или не завершён/);
  }

  const back = interpretInstagramOAuthReturn({
    code: null,
    error: null,
    errorDescription: null,
    pending: true
  });
  assert.equal(back.kind, "cancelled");
});

test("код Instagram идёт в обмен, обычный заход ничего не меняет", () => {
  assert.equal(
    interpretInstagramOAuthReturn({
      code: "abc",
      error: null,
      errorDescription: null,
      pending: true
    }).kind,
    "exchange"
  );
  assert.equal(
    interpretInstagramOAuthReturn({
      code: null,
      error: null,
      errorDescription: null,
      pending: false
    }).kind,
    "ignore"
  );
});

test("отмена WhatsApp формулируется без жаргона", () => {
  assert.equal(
    plainWhatsAppOAuthError("Авторизация Meta отменена или не завершена."),
    "Подключение WhatsApp отменено или не завершено."
  );
  assert.equal(plainWhatsAppOAuthError("Не удалось открыть окно SDK"), WHATSAPP_POPUP_BLOCKED);
  assert.equal(/Meta|Cloud API|Direct/.test(WHATSAPP_POPUP_BLOCKED), false);
});

test("пустой токен Telegram — подсказка, неверный — явная ошибка", () => {
  assert.equal(telegramTokenProblem(""), "empty");
  assert.equal(telegramTokenProblem("   "), "empty");
  assert.equal(telegramTokenProblem("not-a-token"), "invalid");
  assert.equal(telegramTokenProblem("123:short"), "invalid");
  assert.equal(telegramTokenMessage("empty"), "Вставьте ключ бота от @BotFather");
  assert.match(telegramTokenMessage("invalid"), /Ключ неверный/);
  assert.equal(
    telegramTokenProblem("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"),
    null
  );
});

test("ответ Telegram Unauthorized не проглатывается", () => {
  assert.match(describeTelegramConnectError("Unauthorized"), /не принял ключ/);
  assert.match(describeTelegramConnectError(""), /не принял ключ/);
  assert.match(describeTelegramConnectError("Failed to fetch"), /Не удалось связаться/);
});
