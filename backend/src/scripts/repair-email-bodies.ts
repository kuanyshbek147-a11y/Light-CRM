/**
 * One-off repair for email messages stored before MIME decoding was fixed.
 * Usage: npx ts-node src/scripts/repair-email-bodies.ts
 */
import { query } from "../db";
import { repairStoredEmailBody } from "../modules/integrations/email/imap";

async function main(): Promise<void> {
  const rows = await query<{ id: string; body: string }>(
    `SELECT m.id, m.body
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.channel = 'email'
       AND m.direction = 'incoming'`
  );

  let updated = 0;
  for (const row of rows) {
    const next = repairStoredEmailBody(row.body);
    if (next !== row.body) {
      await query(`UPDATE messages SET body = $1 WHERE id = $2`, [next, row.id]);
      updated += 1;
      console.log(`fixed ${row.id}: ${JSON.stringify(row.body.slice(0, 40))} -> ${JSON.stringify(next.slice(0, 40))}`);
    }
  }
  console.log(`Done. Updated ${updated} of ${rows.length} email messages.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
