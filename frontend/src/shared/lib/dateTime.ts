/** Часовой пояс по умолчанию для Казахстана, если браузер его не сообщил. */
export const DEFAULT_TIME_ZONE = "Asia/Qyzylorda";

/** Короткий месяц в родительном падеже. «май» → «мая», остальные — короткие основы. */
const MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек"
] as const;

export const RU_DATETIME_ERROR = "Такой даты нет. Введите в формате 25.09.2026, 14:30";

const MONTH_INDEX: Record<string, number> = {
  янв: 1,
  января: 1,
  фев: 2,
  февраля: 2,
  мар: 3,
  марта: 3,
  апр: 4,
  апреля: 4,
  май: 5,
  мая: 5,
  июн: 6,
  июня: 6,
  июл: 7,
  июля: 7,
  авг: 8,
  августа: 8,
  сен: 9,
  сентября: 9,
  окт: 10,
  октября: 10,
  ноя: 11,
  ноября: 11,
  дек: 12,
  декабря: 12
};

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("ru-RU", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function userTimeZone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (resolved && isValidTimeZone(resolved)) {
      return resolved;
    }
  } catch {
    /* браузер без Intl timezone */
  }
  return DEFAULT_TIME_ZONE;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function wallClockInZone(date: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  let hour = Number(map.hour);
  let day = Number(map.day);
  if (hour === 24) {
    hour = 0;
    day += 1;
  }
  const normalized = new Date(Date.UTC(Number(map.year), Number(map.month) - 1, day));
  return {
    year: normalized.getUTCFullYear(),
    month: normalized.getUTCMonth() + 1,
    day: normalized.getUTCDate(),
    hour,
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const wall = wallClockInZone(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - instant.getTime();
}

export function isoToLocalInput(iso: string | null | undefined, timeZone = userTimeZone()): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const wall = wallClockInZone(date, timeZone);
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}

export function zonedLocalInputToIso(local: string, timeZone = userTimeZone()): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (!isValidDateParts(year, month, day) || hour > 23 || minute > 59) {
    return null;
  }
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  let instant = utcGuess - zoneOffsetMs(new Date(utcGuess), timeZone);
  instant = utcGuess - zoneOffsetMs(new Date(instant), timeZone);
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function expandYear(year: number): number {
  if (year < 100) {
    return 2000 + year;
  }
  return year;
}

/** Календарный день в часовом поясе, без сдвига через UTC. */
export function calendarDateKey(daysBeforeToday = 0, timeZone = userTimeZone(), now = new Date()): string {
  const wall = wallClockInZone(now, timeZone);
  const utc = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  utc.setUTCDate(utc.getUTCDate() - daysBeforeToday);
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

/** `YYYY-MM-DD` или начало ISO-строки → `дд.мм.гггг` без сдвига пояса. */
export function formatIsoDateRu(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) {
    return value;
  }
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function toLocalInput(year: number, month: number, day: number, hour: number, minute: number): string | null {
  if (!isValidDateParts(year, month, day) || hour > 23 || minute > 59) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

export type RuDateTimeClassification =
  | { ok: "empty" }
  | { ok: "partial" }
  | { ok: "valid"; value: string; provisional: boolean }
  | { ok: "invalid" };

type TimeClassification =
  | { ok: "none" }
  | { ok: "partial" }
  | { ok: "invalid" }
  | { ok: "valid"; hour: number; minute: number };

/**
 * Время после даты. Любой разделитель (пробел, запятая, точка, двоеточие) или его отсутствие.
 * Неполный фрагмент времени не превращается в 00:00.
 */
function classifyTime(rest: string): TimeClassification {
  if (!rest) {
    return { ok: "none" };
  }
  const trimmed = rest.trim();
  if (!trimmed) {
    return { ok: "none" };
  }
  if (/^[\s,.:]+$/.test(trimmed)) {
    return { ok: "none" };
  }
  const body = trimmed.replace(/^[\s,.:]+/, "");
  if (!body) {
    return { ok: "partial" };
  }
  if (/[^\d\s,.:]/.test(body)) {
    return { ok: "invalid" };
  }

  let hourText = "";
  let minuteText: string | null = null;
  const separated = /^(\d{1,2})[\s,.:]+(\d{0,2})$/.exec(body);
  if (separated) {
    hourText = separated[1];
    minuteText = separated[2];
    if (!minuteText || minuteText.length < 2) {
      return { ok: "partial" };
    }
  } else if (/^\d{1,3}$/.test(body)) {
    return { ok: "partial" };
  } else if (/^\d{4}$/.test(body)) {
    hourText = body.slice(0, 2);
    minuteText = body.slice(2);
  } else {
    return { ok: "invalid" };
  }

  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) {
    return { ok: "invalid" };
  }
  return { ok: "valid", hour, minute };
}

function finishDateTime(
  yearDigits: string,
  month: number,
  day: number,
  time: TimeClassification
): RuDateTimeClassification {
  if (time.ok === "partial") {
    return { ok: "partial" };
  }
  if (time.ok === "invalid") {
    return { ok: "invalid" };
  }
  if (yearDigits.length !== 2 && yearDigits.length !== 4) {
    return { ok: "partial" };
  }
  const year = expandYear(Number(yearDigits));
  const hour = time.ok === "none" ? 0 : time.hour;
  const minute = time.ok === "none" ? 0 : time.minute;
  const value = toLocalInput(year, month, day, hour, minute);
  if (!value) {
    return { ok: "invalid" };
  }
  return {
    ok: "valid",
    value,
    provisional: yearDigits.length === 2 && time.ok === "none"
  };
}

function classifyNamed(raw: string): RuDateTimeClassification {
  const named = /^(\d{1,2})\s+([а-яё]+)(?:\s+(\d{1,4}))?(?:\s*([\s\S]*))?$/.exec(raw);
  if (!named) {
    return { ok: "invalid" };
  }
  const month = MONTH_INDEX[named[2]];
  if (!month) {
    return { ok: "invalid" };
  }
  const yearDigits = named[3] || "";
  if (!yearDigits || yearDigits.length === 1 || yearDigits.length === 3) {
    return { ok: "partial" };
  }
  if (yearDigits.length !== 2 && yearDigits.length !== 4) {
    return { ok: "invalid" };
  }
  return finishDateTime(yearDigits, month, Number(named[1]), classifyTime(named[4] || ""));
}

function classifyNumeric(raw: string): RuDateTimeClassification {
  let index = 0;
  const readDigits = (max: number): string => {
    let chunk = "";
    while (index < raw.length && chunk.length < max && /\d/.test(raw[index])) {
      chunk += raw[index];
      index += 1;
    }
    return chunk;
  };

  const dayText = readDigits(2);
  if (!dayText) {
    return { ok: "partial" };
  }
  if (index >= raw.length) {
    return { ok: "partial" };
  }
  if (raw[index] !== ".") {
    return { ok: "invalid" };
  }
  index += 1;
  const monthText = readDigits(2);
  if (!monthText) {
    return { ok: "partial" };
  }
  if (index >= raw.length) {
    return { ok: "partial" };
  }
  if (raw[index] !== ".") {
    return { ok: "invalid" };
  }
  index += 1;
  const yearDigits = readDigits(4);
  if (!yearDigits || yearDigits.length === 1 || yearDigits.length === 3) {
    return { ok: "partial" };
  }

  const day = Number(dayText);
  const month = Number(monthText);
  let time = classifyTime(raw.slice(index));
  let resolvedYear = yearDigits;

  if (yearDigits.length === 4 && (Number(yearDigits) < 2000 || Number(yearDigits) > 2100)) {
    const fallbackTime = classifyTime(`${yearDigits.slice(2)}${raw.slice(index)}`);
    if (fallbackTime.ok === "valid" || fallbackTime.ok === "partial" || fallbackTime.ok === "none") {
      resolvedYear = yearDigits.slice(0, 2);
      time = fallbackTime;
    }
  }

  return finishDateTime(resolvedYear, month, day, time);
}

/**
 * «25.09.2026, 14:30», «26.09.2026,15:00», «26.09.2026 15.00», «25.09.26», «25 сен 2026 14:30».
 * Дата без времени — 00:00. Если время начато, но не распознано, результат пустой, а не 00:00.
 * Двузначный год — 20xx. Четырёхзначный год не обрезается до первых двух цифр.
 */
export function classifyRuDateTime(text: string): RuDateTimeClassification {
  const raw = text.trim().toLowerCase().replace(/[ \t]+/g, " ");
  if (!raw) {
    return { ok: "empty" };
  }
  if (/[a-zа-яё]/i.test(raw)) {
    return classifyNamed(raw);
  }
  return classifyNumeric(raw);
}

export function parseRuDateTimeToLocalInput(text: string): string | null {
  const parsed = classifyRuDateTime(text);
  return parsed.ok === "valid" ? parsed.value : null;
}

export function parseRuDateToKey(text: string): string | null {
  const local = parseRuDateTimeToLocalInput(text);
  if (!local) {
    return null;
  }
  return local.slice(0, 10);
}

export function formatLocalInputRu(local: string, withTime: boolean): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(local.trim());
  if (!match) {
    return "";
  }
  const date = `${match[3]}.${match[2]}.${match[1]}`;
  if (!withTime || !match[4]) {
    return date;
  }
  return `${date}, ${match[4]}:${match[5]}`;
}

export function formatRuDateTime(
  iso: string | null | undefined,
  options?: { withTime?: boolean; style?: "numeric" | "short"; timeZone?: string }
): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const timeZone = options?.timeZone || userTimeZone();
  const wall = wallClockInZone(date, timeZone);
  const withTime = options?.withTime !== false;
  const time = withTime ? `, ${pad(wall.hour)}:${pad(wall.minute)}` : "";
  if (options?.style === "short") {
    const month = MONTHS_SHORT[wall.month - 1] || pad(wall.month);
    const today = wallClockInZone(new Date(), timeZone);
    const year = wall.year === today.year ? "" : ` ${wall.year}`;
    return `${wall.day} ${month}${year}${time}`;
  }
  return `${pad(wall.day)}.${pad(wall.month)}.${wall.year}${time}`;
}

function countDigitsBefore(value: string, until: number): number {
  let count = 0;
  const end = Math.max(0, Math.min(until, value.length));
  for (let index = 0; index < end; index += 1) {
    if (/\d/.test(value[index])) {
      count += 1;
    }
  }
  return count;
}

function formatGroupedDigits(digits: string, groups: readonly number[], separators: readonly string[], trailing: boolean): string {
  let index = 0;
  let text = "";
  for (let group = 0; group < groups.length && index < digits.length; group += 1) {
    const chunk = digits.slice(index, index + groups[group]);
    if (!chunk) {
      break;
    }
    if (group > 0) {
      text += separators[group - 1];
    }
    text += chunk;
    index += chunk.length;
    if (chunk.length < groups[group]) {
      break;
    }
  }
  if (!trailing) {
    return text;
  }
  const length = digits.length;
  if (groups.length === 3) {
    if (length === 2 || length === 4) {
      return `${text}.`;
    }
    return text;
  }
  if (length === 2 || length === 4) {
    return `${text}.`;
  }
  if (length === 8) {
    return `${text}, `;
  }
  if (length === 10) {
    return `${text}:`;
  }
  return text;
}

function maskGroupedDigits(
  raw: string,
  previous: string,
  caret: number,
  maxDigits: number,
  groups: readonly number[],
  separators: readonly string[]
): { text: string; caret: number } {
  const previousDigits = previous.replace(/\D/g, "");
  let digits = raw.replace(/\D/g, "");
  let digitCaret = countDigitsBefore(raw, caret);
  const removedSeparator = previous.length > raw.length && digits.length === previousDigits.length && digits.length > 0;
  if (removedSeparator && digitCaret > 0) {
    const dropAt = digitCaret - 1;
    digits = digits.slice(0, dropAt) + digits.slice(dropAt + 1);
    digitCaret = dropAt;
  }
  digits = digits.slice(0, maxDigits);
  if (digitCaret > digits.length) {
    digitCaret = digits.length;
  }
  const boundary =
    digits.length === 2 ||
    digits.length === 4 ||
    (maxDigits > 8 && (digits.length === 8 || digits.length === 10));
  const userHeldSeparator = /[.,: ]$/.test(raw);
  const text = formatGroupedDigits(digits, groups, separators, boundary && userHeldSeparator && digitCaret === digits.length);
  return { text, caret: digitCaret === digits.length ? text.length : caretAfterDigits(text, digitCaret) };
}

function caretAfterDigits(formatted: string, digitIndex: number): number {
  if (digitIndex <= 0) {
    return 0;
  }
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index])) {
      seen += 1;
      if (seen === digitIndex) {
        return index + 1;
      }
    }
  }
  return formatted.length;
}

/**
 * Маска даты и времени: одни цифры «260920261500» → «26.09.2026, 15:00».
 * Вставка и ввод с разделителями сохраняются. Стирание разделителя удаляет и цифру перед ним.
 * Двузначный год с уже введённым временем не переписывается в четырёхзначный.
 */
export function maskRuDateTimeInput(raw: string, previous = "", caret = raw.length): { text: string; caret: number } {
  if (/[a-zа-яё]/i.test(raw)) {
    const safe = Math.min(Math.max(caret, 0), raw.length);
    return { text: raw, caret: safe };
  }
  const twoDigitYearWithTime = /^(\d{1,2})\D+(\d{1,2})\D+(\d{2})(\D+\d[\s\S]*)$/.exec(raw);
  const fourDigitYear = /^(\d{1,2})\D+(\d{1,2})\D+(\d{4})/.test(raw);
  if (twoDigitYearWithTime && !fourDigitYear) {
    const safe = Math.min(Math.max(caret, 0), raw.length);
    return { text: raw, caret: safe };
  }
  return maskGroupedDigits(raw, previous, caret, 12, [2, 2, 4, 2, 2], [".", ".", ", ", ":"]);
}

/** Маска календарной даты: «26092026» → «26.09.2026». */
export function maskRuDateInput(raw: string, previous = "", caret = raw.length): { text: string; caret: number } {
  if (/[a-zа-яё]/i.test(raw)) {
    const safe = Math.min(Math.max(caret, 0), raw.length);
    return { text: raw, caret: safe };
  }
  return maskGroupedDigits(raw, previous, caret, 8, [2, 2, 4], [".", "."]);
}
