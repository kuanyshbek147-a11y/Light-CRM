const { decryptSecret } = require("../dist/modules/integrations/email/secretCrypto");
const { Client } = require("pg");

(async () => {
  const client = new Client({
    host: process.env.DB_HOST || "db",
    user: "postgres",
    password: "postgres",
    database: "whatsapp_crm"
  });
  await client.connect();
  const { rows } = await client.query(
    "SELECT value FROM workspace_settings WHERE key = 'email_password' LIMIT 1"
  );
  if (!rows[0]) {
    console.log("no password row");
    await client.end();
    return;
  }
  const plain = decryptSecret(rows[0].value);
  console.log("prefix", rows[0].value.slice(0, 14));
  console.log("decrypt_ok", typeof plain === "string" && plain.length >= 8);
  console.log("key_env_set", Boolean(process.env.EMAIL_CREDENTIALS_KEY));
  console.log("key_is_hex64", /^[0-9a-f]{64}$/i.test(process.env.EMAIL_CREDENTIALS_KEY || ""));
  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
