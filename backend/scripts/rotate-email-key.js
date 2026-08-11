const crypto = require("crypto");
const { Client } = require("pg");

const PREFIX = "enc:v1:";

function keyFrom(raw) {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return crypto.createHash("sha256").update(`email-creds:${raw}`).digest();
}

function decrypt(value, rawKey) {
  if (!value.startsWith(PREFIX)) {
    return value;
  }
  const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(":");
  const key = keyFrom(rawKey);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function encrypt(plain, rawKey) {
  const key = keyFrom(rawKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

async function main() {
  const oldKey = process.env.OLD_KEY;
  const newKey = process.env.NEW_KEY;
  if (!oldKey || !newKey) {
    throw new Error("OLD_KEY and NEW_KEY are required");
  }

  const client = new Client({
    host: process.env.DB_HOST || "db",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "whatsapp_crm"
  });
  await client.connect();

  const { rows } = await client.query(
    "SELECT workspace_id, value FROM workspace_settings WHERE key = 'email_password'"
  );

  let rotated = 0;
  for (const row of rows) {
    const plain = decrypt(row.value, oldKey);
    const next = encrypt(plain, newKey);
    // sanity: decrypt with new key
    if (decrypt(next, newKey) !== plain) {
      throw new Error(`Roundtrip failed for workspace ${row.workspace_id}`);
    }
    await client.query(
      "UPDATE workspace_settings SET value = $1, updated_at = now() WHERE workspace_id = $2 AND key = $3",
      [next, row.workspace_id, "email_password"]
    );
    rotated += 1;
    console.log(`rotated ${row.workspace_id} -> ${next.slice(0, 14)}...`);
  }

  console.log(`done rotated=${rotated}`);
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
