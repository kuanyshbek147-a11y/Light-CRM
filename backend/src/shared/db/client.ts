import { Pool, type PoolConfig } from "pg";
import "../../load-env";

function buildPoolConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL?.trim();
  const host = process.env.DB_HOST || "localhost";
  const needsSsl =
    process.env.DB_SSL === "true" ||
    host.includes(".render.com") ||
    Boolean(connectionString?.includes(".render.com"));

  if (connectionString) {
    return {
      connectionString,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined
    };
  }

  return {
    host,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "whatsapp_crm",
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined
  };
}

export const pool = new Pool(buildPoolConfig());
export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
