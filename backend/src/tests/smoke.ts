import { pool } from "../db";

async function run(): Promise<void> {
  const checks: Array<{ table: string }> = await pool.query(
    `SELECT table_name AS table
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
     ORDER BY table_name ASC`,
    [[
      "users",
      "contacts",
      "conversations",
      "messages",
      "deals",
      "pipeline_stages",
      "tasks",
      "activities",
      "metric_snapshots"
    ]]
  ).then((r) => r.rows);

  if (checks.length !== 9) {
    throw new Error(`schema_smoke_failed: expected 9 core tables, got ${checks.length}`);
  }

  console.log("schema_smoke_ok");
  await pool.end();
}

run().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
