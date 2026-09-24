import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STAGE_LABELS_RU,
  formatBuiltinStageLabel,
  formatChannelLabel,
  formatDialogStatus
} from "./src/shared/i18n/glossary.ts";
import { DEFAULT_LOCALE } from "./src/shared/i18n/locale.ts";

test("язык по умолчанию — русский, без переключателя KK/EN", () => {
  assert.equal(DEFAULT_LOCALE, "ru");
});

test("стандартные этапы воронки без английского жаргона", () => {
  assert.equal(formatBuiltinStageLabel("qualified"), "Квалифицирована");
  assert.equal(formatBuiltinStageLabel(" Qualified "), DEFAULT_STAGE_LABELS_RU.qualified);
  assert.equal(formatBuiltinStageLabel("new"), "новая");
  assert.equal(formatBuiltinStageLabel("won"), "выиграна");
  assert.equal(formatBuiltinStageLabel("lost"), "проиграна");
  assert.equal(formatBuiltinStageLabel("Квалификация"), null);
  const joined = Object.values(DEFAULT_STAGE_LABELS_RU).join(" ");
  assert.equal(/\b(SLA|FRT|inbox|qualified|follow-up)\b/i.test(joined), false);
});

test("каналы и статусы диалога по-русски", () => {
  assert.equal(formatChannelLabel("email"), "Почта");
  assert.equal(formatChannelLabel("web"), "Сайт");
  assert.equal(formatChannelLabel("whatsapp"), "WhatsApp");
  assert.equal(formatDialogStatus("open"), "открыт");
  assert.equal(formatDialogStatus("closed"), "закрыт");
});
