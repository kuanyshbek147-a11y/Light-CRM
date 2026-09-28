import fs from "fs";
import { gunzipSync } from "zlib";
import type { PoolClient } from "pg";
import { pool } from "../db";
import { ensureUserLoginSchema } from "../migrate";

/**
 * Восстановление базы из копии данных .jsonl(.gz) — её делают ночная копия (nightly-backup.ts),
 * когда на сервере нет pg_dump, и ручная копия из панели платформы.
 *
 *   npm run -w backend restore:backup -- путь/к/light-crm-....jsonl.gz
 *
 * База берётся из тех же переменных, что и у сервера (DATABASE_URL или DB_*). Скрипт создаёт схему,
 * как при старте сервера, затем для каждой таблицы из копии стирает её строки и загружает строки
 * из копии. Всё в одной транзакции: при любой ошибке база остаётся как была.
 * Копии .sql.gz восстанавливаются без скрипта: gunzip -c файл | psql "<адрес базы>".
 */

export type BackupTable = { name: string; rows: unknown[] };

/** Разбирает копию: строка «-- TABLE имя», затем по строке JSON на запись. */
export function parseJsonlBackup(text: string): BackupTable[] {
  const tables: BackupTable[] = [];
  let current: BackupTable | null = null;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith("-- TABLE ")) {
      const header = line.slice("-- TABLE ".length).trim();
      // Ручная копия помечает так таблицы, которые не удалось прочитать.
      current = header.endsWith(" skipped") ? null : { name: header, rows: [] };
      if (current) {
        tables.push(current);
      }
      continue;
    }
    if (line.startsWith("--")) {
      continue;
    }
    if (!current) {
      throw new Error(`Строка данных до заголовка таблицы: ${line.slice(0, 80)}`);
    }
    current.rows.push(JSON.parse(line));
  }
  return tables;
}

/**
 * Порядок загрузки: сначала таблицы, на которые ссылаются другие. Связи таблицы с самой собой
 * и циклы порядок не решает — такие строки догружаются повторными проходами в restoreTable.
 */
export function orderTablesByDependencies(tables: string[], references: Array<{ from: string; to: string }>): string[] {
  const set = new Set(tables);
  const deps = new Map<string, Set<string>>(tables.map((name) => [name, new Set<string>()]));
  for (const { from, to } of references) {
    if (from !== to && set.has(from) && set.has(to)) {
      deps.get(from)!.add(to);
    }
  }
  const ordered: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (name: string) => {
    if (done.has(name) || visiting.has(name)) {
      return;
    }
    visiting.add(name);
    for (const dep of [...deps.get(name)!].sort()) {
      visit(dep);
    }
    visiting.delete(name);
    done.add(name);
    ordered.push(name);
  };
  for (const name of [...tables].sort()) {
    visit(name);
  }
  return ordered;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function insertRow(client: PoolClient, table: string, row: unknown): Promise<void> {
  const t = quoteIdent(table);
  await client.query(`INSERT INTO ${t} SELECT * FROM json_populate_record(NULL::${t}, $1::json)`, [JSON.stringify(row)]);
}

/** Строки, которые ссылаются на ещё не загруженные записи той же таблицы, повторяем, пока есть успех. */
async function restoreTable(client: PoolClient, table: string, rows: unknown[]): Promise<number> {
  const t = quoteIdent(table);
  if (rows.length === 0) {
    return 0;
  }
  await client.query("SAVEPOINT restore_table");
  try {
    await client.query(`INSERT INTO ${t} SELECT * FROM json_populate_recordset(NULL::${t}, $1::json)`, [
      JSON.stringify(rows)
    ]);
    await client.query("RELEASE SAVEPOINT restore_table");
    return rows.length;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT restore_table");
    if ((error as { code?: string }).code !== "23503") {
      throw error;
    }
  }

  let pending = rows;
  while (pending.length > 0) {
    const failed: unknown[] = [];
    let lastError: unknown = null;
    for (const row of pending) {
      await client.query("SAVEPOINT restore_row");
      try {
        await insertRow(client, table, row);
        await client.query("RELEASE SAVEPOINT restore_row");
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT restore_row");
        if ((error as { code?: string }).code !== "23503") {
          throw error;
        }
        failed.push(row);
        lastError = error;
      }
    }
    if (failed.length === pending.length) {
      throw lastError;
    }
    pending = failed;
  }
  return rows.length;
}

export async function restoreJsonlBackup(filePath: string): Promise<void> {
  const raw = fs.readFileSync(filePath);
  const text = (filePath.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8");
  const tables = parseJsonlBackup(text);
  if (tables.length === 0) {
    throw new Error("В копии нет ни одной таблицы");
  }

  await ensureUserLoginSchema();

  const existing = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  const existingNames = new Set(existing.rows.map((row) => row.table_name));
  const missing = tables.filter((table) => !existingNames.has(table.name)).map((table) => table.name);
  if (missing.length > 0) {
    console.warn(`[restore] этих таблиц нет в текущей схеме, пропускаю: ${missing.join(", ")}`);
  }
  const present = tables.filter((table) => existingNames.has(table.name));
  const byName = new Map(present.map((table) => [table.name, table]));

  const references = await pool.query<{ from_table: string; to_table: string }>(
    `SELECT tc.table_name AS from_table, ccu.table_name AS to_table
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`
  );
  const order = orderTablesByDependencies(
    present.map((table) => table.name),
    references.rows.map((row) => ({ from: row.from_table, to: row.to_table }))
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Стираем строки, которые сервер мог создать при старте (сид), чтобы не было дублей.
    await client.query(`TRUNCATE ${order.map(quoteIdent).join(", ")} CASCADE`);
    for (const name of order) {
      const count = await restoreTable(client, name, byName.get(name)!.rows);
      console.log(`[restore] ${name}: ${count}`);
    }
    await client.query("COMMIT");
    console.log(`[restore] готово: ${order.length} таблиц`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Укажите файл копии: npm run -w backend restore:backup -- light-crm-....jsonl.gz");
    process.exit(1);
  }
  restoreJsonlBackup(filePath)
    .then(() => pool.end())
    .catch(async (error) => {
      console.error("[restore] не удалось восстановить, база не изменена:", error);
      await pool.end().catch(() => undefined);
      process.exit(1);
    });
}
