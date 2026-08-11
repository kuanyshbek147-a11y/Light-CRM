const { Client } = require("pg");
const { repairStoredEmailBody } = require("../dist/modules/integrations/email/imap");

async function main() {
  const c = new Client({
    host: process.env.DB_HOST || "db",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "whatsapp_crm"
  });
  await c.connect();
  const { rows } = await c.query(
    `SELECT m.id, m.body
     FROM messages m
     JOIN conversations cv ON cv.id = m.conversation_id
     WHERE cv.channel = 'email' AND m.direction = 'incoming'`
  );
  let updated = 0;
  for (const row of rows) {
    const next = repairStoredEmailBody(row.body);
    if (next !== row.body) {
      await c.query("UPDATE messages SET body = $1 WHERE id = $2", [next, row.id]);
      updated += 1;
      console.log(
        "fixed",
        row.id,
        JSON.stringify(String(row.body).slice(0, 40)),
        "->",
        JSON.stringify(String(next).slice(0, 40))
      );
    }
  }
  console.log(`Updated ${updated} of ${rows.length}`);
  await c.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
