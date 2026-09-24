import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STAGE_LABELS_RU,
  UI_LABELS_RU,
  displayTaskTitle,
  formatBuiltinStageLabel,
  formatChannelLabel,
  formatDialogStatus,
  formatIntegrationSource
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

test("жаргон телефонии, ИИ и срока ответа — русская подпись, термин вторичен", () => {
  assert.equal(displayTaskTitle("SLA follow-up"), "Срок ответа");
  assert.equal(displayTaskTitle("Позвонить клиенту"), "Позвонить клиенту");
  assert.equal(UI_LABELS_RU.wssUrl, "Адрес соединения");
  assert.equal(UI_LABELS_RU.wssUrlHint, "WSS URL");
  assert.equal(UI_LABELS_RU.sipDomain, "Домен АТС");
  assert.equal(UI_LABELS_RU.displayName, "Имя на экране телефона");
  assert.equal(UI_LABELS_RU.iceTurn, "Серверы для звонка через интернет");
  assert.equal(UI_LABELS_RU.openaiKey, "Ключ ИИ");
  assert.equal(UI_LABELS_RU.openaiKeyHint, "OPENAI_API_KEY");
  assert.equal(/\b(SLA follow-up|WSS URL|Display name|OPENAI_API_KEY)\b/.test(UI_LABELS_RU.wssUrl), false);
  assert.equal(formatIntegrationSource("workspace"), "этот кабинет");
  assert.equal(formatIntegrationSource("env"), "общая настройка сервера");
});

test("каналы и статусы диалога по-русски", () => {
  assert.equal(formatChannelLabel("email"), "Почта");
  assert.equal(formatChannelLabel("web"), "Сайт");
  assert.equal(formatChannelLabel("whatsapp"), "WhatsApp");
  assert.equal(formatDialogStatus("open"), "открыт");
  assert.equal(formatDialogStatus("closed"), "закрыт");
});
