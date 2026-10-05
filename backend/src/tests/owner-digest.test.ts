import assert from "node:assert/strict";
import test from "node:test";
import {
  formatMinutes,
  formatOwnerDigest,
  isDigestDue,
  localDayAndHour,
  localDayWindow,
  parseDigestHour
} from "../modules/ops/owner-digest";

const TZ = "Asia/Almaty";

test("местный день в Алматы считается от полуночи по UTC+5", () => {
  const { start, end } = localDayWindow("2026-09-28", TZ);
  assert.equal(start.toISOString(), "2026-09-27T19:00:00.000Z");
  assert.equal(end.toISOString(), "2026-09-28T19:00:00.000Z");
  assert.deepEqual(localDayAndHour(new Date("2026-09-28T15:30:00Z"), TZ), { day: "2026-09-28", hour: 20 });
});

test("сводка уходит один раз в день, начиная с выбранного часа", () => {
  const evening = new Date("2026-09-28T15:10:00Z"); // 20:10 в Алматы
  const afternoon = new Date("2026-09-28T10:00:00Z"); // 15:00 в Алматы
  assert.equal(isDigestDue(evening, { hour: 20, lastSent: null }, TZ), true);
  assert.equal(isDigestDue(evening, { hour: 20, lastSent: "2026-09-28" }, TZ), false);
  assert.equal(isDigestDue(afternoon, { hour: 20, lastSent: "2026-09-27" }, TZ), false);
});

test("час сводки только целый от 0 до 23", () => {
  assert.equal(parseDigestHour("20"), 20);
  assert.equal(parseDigestHour(0), 0);
  assert.equal(parseDigestHour(24), null);
  assert.equal(parseDigestHour("вечер"), null);
});

test("минуты и часы по-русски", () => {
  assert.equal(formatMinutes(14), "14 мин");
  assert.equal(formatMinutes(60), "1 ч");
  assert.equal(formatMinutes(135), "2 ч 15 мин");
});

test("текст сводки показывает ждущих и менеджеров", () => {
  const text = formatOwnerDigest({
    day: "2026-09-28",
    wrote: 23,
    answered: 20,
    avgReplyMinutes: 14,
    slowReplies: 2,
    waitingTotal: 3,
    waiting: [
      { name: "Айгерим", waitingMinutes: 125 },
      { name: "+7 701 000 00 00", waitingMinutes: 190 }
    ],
    managers: [{ name: "Дана", answered: 12, avgMinutes: 9 }]
  });
  assert.match(text, /Сводка за 28 сентября/);
  assert.match(text, /Написали: 23/);
  assert.match(text, /Ответили: 20 из 23/);
  assert.match(text, /Среднее время ответа: 14 мин/);
  assert.match(text, /Ответили позже чем через час: 2/);
  assert.match(text, /Ждут ответа: 3/);
  assert.match(text, /• Айгерим — 2 ч 5 мин/);
  assert.match(text, /…и ещё 1/);
  assert.match(text, /• Дана: 12, в среднем 9 мин/);
});

test("пустой день — короткое сообщение", () => {
  const text = formatOwnerDigest({
    day: "2026-09-28",
    wrote: 0,
    answered: 0,
    avgReplyMinutes: 0,
    slowReplies: 0,
    waitingTotal: 0,
    waiting: [],
    managers: []
  });
  assert.match(text, /новых сообщений от клиентов не было/);
});
