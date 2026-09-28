import { randomBytes } from "crypto";
import { query } from "../../db";
import { getTelegramCredentialsForWorkspace } from "../integrations/telegram/credentials";
import { sendWorkspaceTelegramAlert, setOpsAlertChatId } from "./alerts";

/**
 * Вечерняя сводка владельцу в Telegram: сколько людей написало за день, скольким ответили,
 * за сколько минут и кто до сих пор ждёт ответа.
 *
 * Уходит в тот же чат, что и уведомления из раздела «Операции». Владелец подключает чат одной
 * ссылкой на бота компании (/start digest-<код>), номер чата вручную искать не нужно.
 * Сервер раз в 10 минут проверяет, наступил ли час отправки по времени компании, и шлёт сводку
 * один раз в день (дата последней отправки хранится в настройках).
 */

export const DIGEST_TIMEZONE = (process.env.DIGEST_TIMEZONE || "Asia/Almaty").trim();
export const DEFAULT_DIGEST_HOUR = 20;
/** Ответ медленнее этого считаем поздним. */
export const SLOW_REPLY_MINUTES = 60;
const WAITING_LIST_LIMIT = 5;
const CHECK_INTERVAL_MS = 10 * 60_000;
export const DIGEST_START_PREFIX = "digest-";

const KEYS = {
  chatId: "ops_alert_telegram_chat_id",
  enabled: "owner_digest_enabled",
  hour: "owner_digest_hour",
  lastSent: "owner_digest_last_sent",
  linkCode: "owner_digest_link_code"
} as const;

export type DigestWaiting = { name: string; waitingMinutes: number };
export type DigestManager = { name: string; answered: number; avgMinutes: number };

export type OwnerDigestStats = {
  day: string;
  wrote: number;
  answered: number;
  avgReplyMinutes: number;
  slowReplies: number;
  waiting: DigestWaiting[];
  waitingTotal: number;
  managers: DigestManager[];
};

export type OwnerDigestSettings = {
  enabled: boolean;
  hour: number;
  chatConnected: boolean;
  connectUrl: string | null;
};

// ---------- время ----------

function zonedParts(date: Date, timeZone: string): { y: number; m: number; d: number; h: number; min: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

/** Дата (YYYY-MM-DD) и час в часовом поясе компании. */
export function localDayAndHour(now: Date, timeZone = DIGEST_TIMEZONE): { day: string; hour: number } {
  const { y, m, d, h } = zonedParts(now, timeZone);
  return { day: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, hour: h };
}

/** Границы местного дня в UTC: [start, end). */
export function localDayWindow(day: string, timeZone = DIGEST_TIMEZONE): { start: Date; end: Date } {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0);
  const shown = zonedParts(new Date(guess), timeZone);
  const offset = Date.UTC(shown.y, shown.m - 1, shown.d, shown.h, shown.min) - guess;
  const start = new Date(guess - offset);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function isDigestDue(
  now: Date,
  settings: { hour: number; lastSent: string | null },
  timeZone = DIGEST_TIMEZONE
): boolean {
  const local = localDayAndHour(now, timeZone);
  return local.hour >= settings.hour && settings.lastSent !== local.day;
}

// ---------- текст ----------

export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} мин`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function formatRuDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

export function formatOwnerDigest(stats: OwnerDigestStats): string {
  const lines = [`📊 Сводка за ${formatRuDay(stats.day)}`, ""];
  if (stats.wrote === 0) {
    lines.push("Сегодня новых сообщений от клиентов не было.");
    return lines.join("\n");
  }

  lines.push(`Написали: ${stats.wrote}`);
  lines.push(`Ответили: ${stats.answered} из ${stats.wrote}`);
  if (stats.answered > 0) {
    lines.push(`Среднее время ответа: ${formatMinutes(stats.avgReplyMinutes)}`);
  }
  if (stats.slowReplies > 0) {
    lines.push(`Ответили позже чем через час: ${stats.slowReplies}`);
  }

  if (stats.waitingTotal > 0) {
    lines.push("", `⚠️ Ждут ответа: ${stats.waitingTotal}`);
    for (const item of stats.waiting) {
      lines.push(`• ${item.name} — ${formatMinutes(item.waitingMinutes)}`);
    }
    if (stats.waitingTotal > stats.waiting.length) {
      lines.push(`…и ещё ${stats.waitingTotal - stats.waiting.length}`);
    }
  } else {
    lines.push("", "✅ Без ответа никого не осталось");
  }

  if (stats.managers.length > 0) {
    lines.push("", "По менеджерам:");
    for (const manager of stats.managers) {
      lines.push(`• ${manager.name}: ${manager.answered}, в среднем ${formatMinutes(manager.avgMinutes)}`);
    }
  }
  return lines.join("\n");
}

// ---------- данные ----------

export async function collectOwnerDigestStats(
  workspaceId: string,
  day: string,
  now = new Date(),
  timeZone = DIGEST_TIMEZONE
): Promise<OwnerDigestStats> {
  const { start, end } = localDayWindow(day, timeZone);
  const range = [workspaceId, start.toISOString(), end.toISOString()];

  // Для каждого диалога, где клиент писал за день: первое входящее за день и первый ответ после него.
  const cohort = `
    WITH first_in AS (
      SELECT m.conversation_id, MIN(m.created_at) AS in_time
      FROM messages m
      WHERE m.workspace_id = $1
        AND m.direction = 'incoming'
        AND m.created_at >= $2::timestamptz
        AND m.created_at < $3::timestamptz
      GROUP BY m.conversation_id
    ), replies AS (
      SELECT fi.conversation_id, fi.in_time,
             (SELECT MIN(o.created_at) FROM messages o
               WHERE o.conversation_id = fi.conversation_id
                 AND o.direction = 'outgoing'
                 AND o.created_at >= fi.in_time) AS out_time
      FROM first_in fi
    )`;

  const [summary] = await query<{
    wrote: string;
    answered: string;
    avg_minutes: string;
    slow: string;
    waiting: string;
  }>(
    `${cohort}
     SELECT COUNT(*)::text AS wrote,
            COUNT(out_time)::text AS answered,
            COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (out_time - in_time)) / 60)), 0)::text AS avg_minutes,
            COUNT(*) FILTER (WHERE out_time - in_time > make_interval(mins => $4::int))::text AS slow,
            COUNT(*) FILTER (WHERE out_time IS NULL)::text AS waiting
     FROM replies`,
    [...range, SLOW_REPLY_MINUTES]
  );

  const waiting = await query<{ name: string; waiting_minutes: string }>(
    `${cohort}
     SELECT COALESCE(NULLIF(ct.name, ''), ct.phone, 'Без имени') AS name,
            ROUND(EXTRACT(EPOCH FROM ($4::timestamptz - r.in_time::timestamptz)) / 60)::text AS waiting_minutes
     FROM replies r
     JOIN conversations c ON c.id = r.conversation_id
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE r.out_time IS NULL
     ORDER BY r.in_time ASC
     LIMIT ${WAITING_LIST_LIMIT}`,
    [...range, now.toISOString()]
  );

  const managers = await query<{ name: string; answered: string; avg_minutes: string }>(
    `${cohort}
     SELECT u.full_name AS name,
            COUNT(*)::text AS answered,
            COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (r.out_time - r.in_time)) / 60)), 0)::text AS avg_minutes
     FROM replies r
     JOIN conversations c ON c.id = r.conversation_id
     JOIN users u ON u.id = c.assigned_manager_id
     WHERE r.out_time IS NOT NULL
     GROUP BY u.full_name
     ORDER BY COUNT(*) DESC
     LIMIT 10`,
    range
  );

  return {
    day,
    wrote: Number(summary?.wrote || 0),
    answered: Number(summary?.answered || 0),
    avgReplyMinutes: Number(summary?.avg_minutes || 0),
    slowReplies: Number(summary?.slow || 0),
    waitingTotal: Number(summary?.waiting || 0),
    waiting: waiting.map((row) => ({ name: row.name, waitingMinutes: Number(row.waiting_minutes || 0) })),
    managers: managers.map((row) => ({
      name: row.name,
      answered: Number(row.answered || 0),
      avgMinutes: Number(row.avg_minutes || 0)
    }))
  };
}

// ---------- настройки ----------

async function getSettings(workspaceId: string): Promise<Record<string, string>> {
  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM workspace_settings WHERE workspace_id = $1 AND key = ANY($2::text[])`,
    [workspaceId, Object.values(KEYS)]
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

async function setSetting(workspaceId: string, key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO workspace_settings (workspace_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [workspaceId, key, value]
  );
}

export function parseDigestHour(raw: unknown): number | null {
  const hour = Number(raw);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

export async function getOwnerDigestSettings(workspaceId: string): Promise<OwnerDigestSettings> {
  const settings = await getSettings(workspaceId);
  let code = settings[KEYS.linkCode];
  if (!code) {
    code = randomBytes(9).toString("hex");
    await setSetting(workspaceId, KEYS.linkCode, code);
  }
  const credentials = await getTelegramCredentialsForWorkspace(workspaceId);
  const username = (credentials?.botUsername || "").replace(/^@/, "").trim();
  return {
    enabled: settings[KEYS.enabled] !== "0",
    hour: parseDigestHour(settings[KEYS.hour]) ?? DEFAULT_DIGEST_HOUR,
    chatConnected: Boolean((settings[KEYS.chatId] || "").trim()),
    connectUrl: username ? `https://t.me/${username}?start=${DIGEST_START_PREFIX}${code}` : null
  };
}

export async function saveOwnerDigestSettings(
  workspaceId: string,
  input: { enabled?: boolean; hour?: number }
): Promise<void> {
  if (typeof input.enabled === "boolean") {
    await setSetting(workspaceId, KEYS.enabled, input.enabled ? "1" : "0");
  }
  if (typeof input.hour === "number") {
    await setSetting(workspaceId, KEYS.hour, String(input.hour));
  }
}

/**
 * Владелец открыл ссылку-приглашение в боте компании: сохраняем его чат для сводок.
 * Возвращает true, если сообщение было командой подключения (тогда в диалоги его не пишем).
 */
export async function handleOwnerDigestStart(workspaceId: string, chatId: string, text: string): Promise<boolean> {
  const match = /^\/start\s+digest-([0-9a-f]+)\s*$/i.exec(text.trim());
  if (!match) {
    return false;
  }
  const settings = await getSettings(workspaceId);
  if (!settings[KEYS.linkCode] || settings[KEYS.linkCode] !== match[1].toLowerCase()) {
    return false;
  }
  await setOpsAlertChatId(workspaceId, chatId);
  const hour = parseDigestHour(settings[KEYS.hour]) ?? DEFAULT_DIGEST_HOUR;
  await sendWorkspaceTelegramAlert(
    workspaceId,
    `✅ Готово! Каждый вечер в ${hour}:00 сюда будет приходить сводка: сколько клиентов написали, скольким ответили и кто ждёт ответа.`
  );
  return true;
}

// ---------- отправка ----------

export async function sendOwnerDigest(workspaceId: string, now = new Date()): Promise<boolean> {
  const { day } = localDayAndHour(now);
  const stats = await collectOwnerDigestStats(workspaceId, day, now);
  return sendWorkspaceTelegramAlert(workspaceId, formatOwnerDigest(stats));
}

export async function runOwnerDigestsIfDue(now = new Date()): Promise<void> {
  const workspaces = await query<{ workspace_id: string; hour: string | null; last_sent: string | null }>(
    `SELECT chat.workspace_id,
            hour.value AS hour,
            sent.value AS last_sent
     FROM workspace_settings chat
     LEFT JOIN workspace_settings enabled
       ON enabled.workspace_id = chat.workspace_id AND enabled.key = $2
     LEFT JOIN workspace_settings hour
       ON hour.workspace_id = chat.workspace_id AND hour.key = $3
     LEFT JOIN workspace_settings sent
       ON sent.workspace_id = chat.workspace_id AND sent.key = $4
     WHERE chat.key = $1
       AND chat.value <> ''
       AND COALESCE(enabled.value, '1') <> '0'`,
    [KEYS.chatId, KEYS.enabled, KEYS.hour, KEYS.lastSent]
  );

  const { day } = localDayAndHour(now);
  for (const row of workspaces) {
    const hour = parseDigestHour(row.hour) ?? DEFAULT_DIGEST_HOUR;
    if (!isDigestDue(now, { hour, lastSent: row.last_sent })) {
      continue;
    }
    // Сначала отмечаем день, чтобы при сбое Telegram не слать сводку каждые 10 минут.
    await setSetting(row.workspace_id, KEYS.lastSent, day);
    try {
      await sendOwnerDigest(row.workspace_id, now);
    } catch (error) {
      console.error("[digest] не удалось отправить сводку", row.workspace_id, error);
    }
  }
}

let timer: NodeJS.Timeout | null = null;

export function startOwnerDigests(): void {
  if (timer) {
    return;
  }
  const tick = () => {
    runOwnerDigestsIfDue().catch((error) => console.error("[digest] проверка сводок не удалась:", error));
  };
  setTimeout(tick, 3 * 60_000);
  timer = setInterval(tick, CHECK_INTERVAL_MS);
}
