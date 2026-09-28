import { execFile } from "child_process";
import { promisify } from "util";
import { gzipSync } from "zlib";
import { pool } from "../../db";
import {
  deleteStorageObject,
  isExternalStorageEnabled,
  listStorageObjects,
  putStorageObject
} from "../media/storage";

/**
 * Ежедневная копия базы во внешнее хранилище (R2/S3), папка backups/.
 *
 * У бесплатной базы Render нет своих копий. Сервер раз в час проверяет, есть ли копия моложе суток,
 * и если нет — делает новую; хранятся последние BACKUPS_TO_KEEP. Проверка по самому хранилищу,
 * поэтому перезапуски сервера не плодят лишних копий.
 *
 * Формат: если на сервере есть pg_dump — полный SQL-дамп (.sql.gz). Иначе — данные всех таблиц
 * (.jsonl.gz: строка «-- TABLE имя», затем по строке JSON на запись).
 */

const execFileAsync = promisify(execFile);

export const BACKUP_PREFIX = "backups/";
export const BACKUPS_TO_KEEP = 14;
const BACKUP_MAX_AGE_MS = 23 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

function databaseUrl(): string {
  return (
    process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USER || "postgres"}:${process.env.DB_PASSWORD || "postgres"}@${
      process.env.DB_HOST || "localhost"
    }:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "whatsapp_crm"}`
  );
}

async function dumpWithPgDump(): Promise<Buffer | null> {
  try {
    const { stdout } = await execFileAsync("pg_dump", ["--no-owner", "--no-acl", `--dbname=${databaseUrl()}`], {
      timeout: 5 * 60_000,
      maxBuffer: 512 * 1024 * 1024,
      encoding: "buffer"
    });
    return stdout.length > 0 ? stdout : null;
  } catch {
    return null;
  }
}

async function dumpAllTablesAsJsonl(): Promise<Buffer> {
  const tables = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  const chunks: string[] = [`-- Light CRM data backup ${new Date().toISOString()}\n`];
  for (const { table_name } of tables.rows) {
    const rows = await pool.query(`SELECT row_to_json(t) AS row FROM "${table_name.replace(/"/g, '""')}" t`);
    chunks.push(`-- TABLE ${table_name}\n`);
    for (const row of rows.rows) {
      chunks.push(`${JSON.stringify(row.row)}\n`);
    }
  }
  return Buffer.from(chunks.join(""), "utf8");
}

/** Какие копии удалить, чтобы осталось `keep` самых свежих. */
export function backupsToPrune<T extends { key: string; lastModified: Date }>(items: T[], keep: number): T[] {
  return [...items].sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime()).slice(keep);
}

export function needsNewBackup(items: Array<{ lastModified: Date }>, now = Date.now()): boolean {
  const newest = items.reduce((max, item) => Math.max(max, item.lastModified.getTime()), 0);
  return now - newest >= BACKUP_MAX_AGE_MS;
}

export async function runNightlyBackupIfDue(): Promise<void> {
  if (!isExternalStorageEnabled()) {
    return;
  }
  const existing = await listStorageObjects(BACKUP_PREFIX);
  if (!needsNewBackup(existing)) {
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const sql = await dumpWithPgDump();
  const body = gzipSync(sql ?? (await dumpAllTablesAsJsonl()));
  const key = `${BACKUP_PREFIX}light-crm-${stamp}.${sql ? "sql" : "jsonl"}.gz`;
  await putStorageObject(key, body, "application/gzip");
  console.log(`[backup] копия базы сохранена: ${key} (${Math.round(body.length / 1024)} КБ)`);

  const all = await listStorageObjects(BACKUP_PREFIX);
  for (const old of backupsToPrune(all, BACKUPS_TO_KEEP)) {
    await deleteStorageObject(old.key);
  }
}

let timer: NodeJS.Timeout | null = null;

export function startNightlyBackups(): void {
  if (timer || !isExternalStorageEnabled()) {
    return;
  }
  const tick = () => {
    runNightlyBackupIfDue().catch((error) => console.error("[backup] не удалось сделать копию базы:", error));
  };
  // Первая проверка через пару минут после старта — не мешаем запуску сервера.
  setTimeout(tick, 2 * 60_000);
  timer = setInterval(tick, CHECK_INTERVAL_MS);
}
