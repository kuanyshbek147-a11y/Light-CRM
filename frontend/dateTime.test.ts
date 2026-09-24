import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TIME_ZONE,
  calendarDateKey,
  classifyRuDateTime,
  formatLocalInputRu,
  formatRuDateTime,
  isoToLocalInput,
  maskRuDateTimeInput,
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

test("любой разделитель времени принимается и не подменяется на 00:00", () => {
  assert.equal(parseRuDateTimeToLocalInput("26.09.2026,15:00"), "2026-09-26T15:00");
  assert.equal(parseRuDateTimeToLocalInput("26.09.2026 15.00"), "2026-09-26T15:00");
  assert.equal(parseRuDateTimeToLocalInput("26.09.2026, 15:00"), "2026-09-26T15:00");
  assert.equal(parseRuDateTimeToLocalInput("26.09.202615:00"), "2026-09-26T15:00");
  assert.equal(parseRuDateTimeToLocalInput("26.09.20261500"), "2026-09-26T15:00");
  assert.equal(parseRuDateTimeToLocalInput("26.09.2026 15 00"), "2026-09-26T15:00");
  assert.equal(parseRuDateTimeToLocalInput("26.09.2026,15.00"), "2026-09-26T15:00");
  assert.equal(parseRuDateTimeToLocalInput("26.09.2026,"), "2026-09-26T00:00");
  assert.equal(parseRuDateTimeToLocalInput("26.09.2026 15"), null);
  assert.equal(parseRuDateTimeToLocalInput("26.09.2026, 99:00"), null);
  assert.notEqual(parseRuDateTimeToLocalInput("26.09.2026 15.00"), "2026-09-26T00:00");
  assert.equal(classifyRuDateTime("26.09.2026 15").ok, "partial");
  assert.equal(classifyRuDateTime("26.09.2026, 99:00").ok, "invalid");
});

test("несуществующая дата не разбирается в значение", () => {
  assert.equal(parseRuDateTimeToLocalInput("31.02.2026"), null);
  assert.equal(classifyRuDateTime("31.02.2026").ok, "invalid");
  assert.equal(parseRuDateToKey("31.02.2026"), null);
});

test("маска подставляет разделители в цифры и не залипает на стирании", () => {
  assert.equal(maskRuDateTimeInput("31022026").text, "31.02.2026");
  assert.deepEqual(maskRuDateTimeInput("260920261500"), {
    text: "26.09.2026, 15:00",
    caret: "26.09.2026, 15:00".length
  });
  assert.equal(maskRuDateTimeInput("26.09.2026,15:00").text, "26.09.2026, 15:00");
  assert.equal(maskRuDateTimeInput("26.09.2026 15.00").text, "26.09.2026, 15:00");
  const stuck = maskRuDateTimeInput("26.09", "26.09.", 5);
  assert.notEqual(stuck.text, "26.09.");
  assert.equal(stuck.text, "26.0");
  assert.equal(maskRuDateTimeInput("25.09.26, 15:00").text, "25.09.26, 15:00");
});

test("двузначный год это 20хх, четырёхзначный не обрезается до 20", () => {
  assert.equal(parseRuDateTimeToLocalInput("25.09.26"), "2026-09-25T00:00");
  assert.equal(parseRuDateTimeToLocalInput("25.09.2026"), "2026-09-25T00:00");
  assert.notEqual(parseRuDateTimeToLocalInput("25.09.2026"), "2020-09-25T00:00");
  assert.equal(parseRuDateTimeToLocalInput("25.09.26 15:00"), "2026-09-25T15:00");
  const prefix = classifyRuDateTime("25.09.20");
  assert.equal(prefix.ok, "valid");
  if (prefix.ok === "valid") {
    assert.equal(prefix.provisional, true);
  }
});

test("короткий месяц в родительном падеже, год только если он не текущий", () => {
  const zone = "Asia/Qyzylorda";
  const currentYear = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric" }).format(new Date())
  );
  const mayThisSample = formatRuDateTime("2026-05-05T04:30:00.000Z", { timeZone: zone, style: "short" });
  assert.equal(mayThisSample, currentYear === 2026 ? "5 мая, 09:30" : "5 мая 2026, 09:30");
  assert.equal(
    formatRuDateTime("2024-05-05T04:30:00.000Z", { timeZone: zone, style: "short" }),
    "5 мая 2024, 09:30"
  );
  assert.equal(
    formatRuDateTime("2024-09-05T04:30:00.000Z", { timeZone: zone, style: "short" }),
    "5 сен 2024, 09:30"
  );
});

test("календарный день считается в часовом поясе, а не по UTC", () => {
  const eveningBeforeUtcDate = new Date("2026-09-23T20:30:00.000Z");
  assert.equal(calendarDateKey(0, "Asia/Qyzylorda", eveningBeforeUtcDate), "2026-09-24");
  assert.equal(eveningBeforeUtcDate.toISOString().slice(0, 10), "2026-09-23");
});
