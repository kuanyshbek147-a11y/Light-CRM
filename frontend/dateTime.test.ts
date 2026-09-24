import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TIME_ZONE,
  formatLocalInputRu,
  formatRuDateTime,
  isoToLocalInput,
  parseRuDateTimeToLocalInput,
  parseRuDateToKey,
  userTimeZone,
  zonedLocalInputToIso
} from "./src/shared/lib/dateTime.ts";

test("по умолчанию часовой пояс Кызылорды, если браузерный недоступен как запасной", () => {
  assert.equal(DEFAULT_TIME_ZONE, "Asia/Qyzylorda");
  const zone = userTimeZone();
  assert.equal(typeof zone, "string");
  assert.ok(zone.length > 0);
});

test("момент UTC показывается по Кызылорде как дд.мм.гггг, чч:мм", () => {
  assert.equal(
    formatRuDateTime("2026-09-25T04:30:00.000Z", {
      timeZone: "Asia/Qyzylorda"
    }),
    "25.09.2026, 09:30"
  );
  assert.equal(
    formatRuDateTime("2026-09-05T04:30:47.000Z", {
      timeZone: "Asia/Qyzylorda",
      style: "short"
    }),
    "5 сен, 09:30"
  );
});

test("ввод дд.мм.гггг и короткого месяца разбирается в локальное значение", () => {
  assert.equal(parseRuDateTimeToLocalInput("25.09.2026, 09:30"), "2026-09-25T09:30");
  assert.equal(parseRuDateTimeToLocalInput("5.9.2026"), "2026-09-05T00:00");
  assert.equal(parseRuDateTimeToLocalInput("25 сен 2026 09:30"), "2026-09-25T09:30");
  assert.equal(parseRuDateToKey("25.09.2026"), "2026-09-25");
  assert.equal(parseRuDateTimeToLocalInput("09/25/2026"), null);
  assert.equal(formatLocalInputRu("2026-09-25T09:30", true), "25.09.2026, 09:30");
});

test("круг через Asia/Qyzylorda сохраняет стенное время", () => {
  const iso = zonedLocalInputToIso("2026-09-25T09:30", "Asia/Qyzylorda");
  assert.equal(iso, "2026-09-25T04:30:00.000Z");
  assert.equal(isoToLocalInput(iso, "Asia/Qyzylorda"), "2026-09-25T09:30");
});

test("летнее и зимнее время не сдвигают час при разборе", () => {
  assert.equal(zonedLocalInputToIso("2026-01-15T12:00", "America/New_York"), "2026-01-15T17:00:00.000Z");
  assert.equal(zonedLocalInputToIso("2026-07-15T12:00", "America/New_York"), "2026-07-15T16:00:00.000Z");
});

test("в часовом поясе браузера разбор совпадает с Date", () => {
  const timeZone = userTimeZone();
  const iso = zonedLocalInputToIso("2026-09-25T14:30", timeZone);
  assert.equal(iso, new Date("2026-09-25T14:30").toISOString());
});
