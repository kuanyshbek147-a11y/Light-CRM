const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

async function main() {
  const password = process.argv[2] || "superadmin123";
  const hash = await bcrypt.hash(password, 10);
  const pool = new Pool(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.DB_HOST || "db",
          port: Number(process.env.DB_PORT || 5432),
          user: process.env.DB_USER || "postgres",
          password: process.env.DB_PASSWORD || "postgres",
          database: process.env.DB_NAME || "whatsapp_crm"
        }
  );

  const existing = await pool.query(
    `SELECT id, login, email, role, is_active
     FROM users
     WHERE role = 'superadmin'
        OR lower(trim(login)) = 'superadmin'
        OR lower(trim(email)) = 'platform@lightcrm.local'
     LIMIT 1`
  );

  if (existing.rows[0]) {
    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           login = 'superadmin',
           email = 'platform@lightcrm.local',
           role = 'superadmin',
           is_active = true,
           workspace_id = NULL
       WHERE id = $2`,
      [hash, existing.rows[0].id]
    );
    console.log(JSON.stringify({ action: "updated", user: existing.rows[0], password }));
  } else {
    const inserted = await pool.query(
      `INSERT INTO users (workspace_id, full_name, email, login, role, password_hash, is_active)
       VALUES (NULL, 'Супер-админ Light CRM', 'platform@lightcrm.local', 'superadmin', 'superadmin', $1, true)
       RETURNING id, login, email, role, is_active`,
      [hash]
    );
    console.log(JSON.stringify({ action: "created", user: inserted.rows[0], password }));
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
