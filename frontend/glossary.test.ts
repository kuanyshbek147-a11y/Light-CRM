import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STAGE_LABELS_RU,
  formatBuiltinStageLabel,
  formatChannelLabel,
  formatDialogStatus,
  formatMoney,
  formatTaskTitle,
  formatTimelineItem,
  ruPlural
} from "./src/shared/i18n/glossary.ts";
import { DEFAULT_LOCALE } from "./src/shared/i18n/locale.ts";

test("язык по умолчанию — русский, без переключателя KK/EN", () => {
  assert.equal(DEFAULT_LOCALE, "ru");
});

test("стандартные этапы воронки без английского жаргона", () => {
  assert.equal(formatBuiltinStageLabel("qualified"), "Квалифицирована");
  assert.equal(formatBuiltinStageLabel(" Qualified "), DEFAULT_STAGE_LABELS_RU.qualified);
  assert.equal(formatBuiltinStageLabel("new"), "Новая");
  assert.equal(formatBuiltinStageLabel("won"), "Выиграна");
  assert.equal(formatBuiltinStageLabel("lost"), "Проиграна");
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

test("суммы сделок в тенге с разрядами", () => {
  assert.equal(formatMoney("250000.00").replace(/\s/g, " "), "250 000 ₸");
  assert.equal(formatMoney(1500.5).replace(/\s/g, " "), "1 500,5 ₸");
  assert.equal(formatMoney("0"), "0 ₸");
  assert.equal(formatMoney("abc"), "abc");
});

test("системные задачи показываются по-русски", () => {
  assert.equal(formatTaskTitle("SLA follow-up"), "Ответить клиенту: срок ответа истёк");
  assert.equal(formatTaskTitle("Позвонить"), "Позвонить");
});

test("история клиента без технических кодов и JSON", () => {
  assert.deepEqual(
    formatTimelineItem({ kind: "activity", title: "seed_initialized", detail: '{"source": "seed"}' }),
    { title: "Учебный пример создан", detail: "" }
  );
  assert.deepEqual(
    formatTimelineItem({ kind: "activity", title: "sla_escalation_deferred", detail: '{"minutes": 30}' }),
    { title: "Ответ отложен", detail: "на 30 мин" }
  );
  assert.equal(formatTimelineItem({ kind: "activity", title: "unknown_code", detail: "{}" }).title, "Действие в CRM");
  assert.deepEqual(
    formatTimelineItem({ kind: "message", title: "Входящее сообщение", detail: "Привет" }),
    { title: "Входящее сообщение", detail: "Привет" }
  );
});

test("числа с правильными окончаниями", () => {
  const chats = ["чат", "чата", "чатов"] as const;
  assert.equal(ruPlural(1, chats), "1 чат");
  assert.equal(ruPlural(3, chats), "3 чата");
  assert.equal(ruPlural(11, chats), "11 чатов");
  assert.equal(ruPlural(21, chats), "21 чат");
  assert.equal(ruPlural(0, chats), "0 чатов");
});
