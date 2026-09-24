/** Часовой пояс по умолчанию для Казахстана, если браузер его не сообщил. */
export const DEFAULT_TIME_ZONE = "Asia/Qyzylorda";

const MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек"
] as const;

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

function toLocalInput(year: number, month: number, day: number, hour: number, minute: number): string | null {
  if (!isValidDateParts(year, month, day) || hour > 23 || minute > 59) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

/**
 * «25.09.2026, 14:30», «25.09.2026», «25 сен 2026 14:30» → `YYYY-MM-DDTHH:mm`.
 * Если время не указано, берётся 00:00 этого календарного дня.
 */
export function parseRuDateTimeToLocalInput(text: string): string | null {
  const raw = text.trim().toLowerCase().replace(/\s+/g, " ").replace(",", "");
  if (!raw) {
    return null;
  }
  const numeric = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?: (\d{1,2}):(\d{2}))?$/.exec(raw);
  if (numeric) {
    return toLocalInput(
      expandYear(Number(numeric[3])),
      Number(numeric[2]),
      Number(numeric[1]),
      numeric[4] === undefined ? 0 : Number(numeric[4]),
      numeric[5] === undefined ? 0 : Number(numeric[5])
    );
  }
  const named = /^(\d{1,2}) ([а-яё]+) (\d{2}|\d{4})(?: (\d{1,2}):(\d{2}))?$/.exec(raw);
  if (!named) {
    return null;
  }
  const month = MONTH_INDEX[named[2]];
  if (!month) {
    return null;
  }
  return toLocalInput(
    expandYear(Number(named[3])),
    month,
    Number(named[1]),
    named[4] === undefined ? 0 : Number(named[4]),
    named[5] === undefined ? 0 : Number(named[5])
  );
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
    return `${wall.day} ${month}${time}`;
  }
  return `${pad(wall.day)}.${pad(wall.month)}.${wall.year}${time}`;
}
