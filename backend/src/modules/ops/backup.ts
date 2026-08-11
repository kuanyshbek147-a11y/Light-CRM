import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { pool } from "../../db";

const execFileAsync = promisify(execFile);

function backupsDir(): string {
  return path.join(process.cwd(), "backups");
}

function databaseUrl(): string {
  return (
    process.env.DATABASE_URL ||
    `postgresql://${process.env.DB_USER || "postgres"}:${process.env.DB_PASSWORD || "postgres"}@${
      process.env.DB_HOST || "localhost"
    }:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "whatsapp_crm"}`
  );
}

export async function createDatabaseBackup(): Promise<
  { fileName: string; relativePath: string; bytes: number } | { error: string }
> {
  await fs.mkdir(backupsDir(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `light-crm-${stamp}.sql`;
  const filePath = path.join(backupsDir(), fileName);

  try {
    await execFileAsync(
      "pg_dump",
      ["--no-owner", "--no-acl", `--dbname=${databaseUrl()}`, `-f`, filePath],
      { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 }
    );
    const stat = await fs.stat(filePath);
    return {
      fileName,
      relativePath: `/backups/${fileName}`,
      bytes: stat.size
    };
  } catch (pgDumpError) {
    // Fallback: logical dump of key tables via SQL COPY-like export
    try {
      const tables = [
        "workspaces",
        "users",
        "contacts",
        "conversations",
        "messages",
        "deals",
        "tasks",
        "marketing_segments",
        "marketing_campaigns",
        "marketing_content_posts"
      ];
      const chunks: string[] = [`-- Light CRM fallback backup ${stamp}\n`];
      for (const table of tables) {
        try {
          const result = await pool.query(`SELECT row_to_json(t) AS row FROM ${table} t`);
          chunks.push(`\n-- TABLE ${table}\n`);
          for (const row of result.rows) {
            chunks.push(JSON.stringify(row.row) + "\n");
          }
        } catch {
          chunks.push(`\n-- TABLE ${table} skipped\n`);
        }
      }
      const jsonName = `light-crm-${stamp}.jsonl`;
      const jsonPath = path.join(backupsDir(), jsonName);
      await fs.writeFile(jsonPath, chunks.join(""), "utf8");
      const stat = await fs.stat(jsonPath);
      void pgDumpError;
      return {
        fileName: jsonName,
        relativePath: `/backups/${jsonName}`,
        bytes: stat.size
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "backup_failed";
      return { error: message };
    }
  }
}

export async function listDatabaseBackups(): Promise<
  Array<{ fileName: string; relativePath: string; bytes: number; modifiedAt: string }>
> {
  try {
    await fs.mkdir(backupsDir(), { recursive: true });
    const files = await fs.readdir(backupsDir());
    const rows = [];
    for (const fileName of files) {
      if (!fileName.startsWith("light-crm-")) continue;
      const stat = await fs.stat(path.join(backupsDir(), fileName));
      rows.push({
        fileName,
        relativePath: `/backups/${fileName}`,
        bytes: stat.size,
        modifiedAt: stat.mtime.toISOString()
      });
    }
    return rows.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 30);
  } catch {
    return [];
  }
}
