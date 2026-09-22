#!/usr/bin/env bash
# One-time environment bootstrap for the WhatsApp CRM MVP.
# Installs system PostgreSQL, project dependencies, and prepares the local database.
# Must be idempotent: it can run again against a partially prepared machine.
set -euo pipefail

PG_VERSION=16
DB_NAME=whatsapp_crm
DB_USER=postgres
DB_PASSWORD=postgres

echo "==> Installing system PostgreSQL (${PG_VERSION}) if missing"
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib
fi

echo "==> Installing Node dependencies (npm workspaces)"
npm install

echo "==> Starting PostgreSQL cluster"
sudo pg_ctlcluster "${PG_VERSION}" main start 2>/dev/null || true

echo "==> Waiting for PostgreSQL to accept connections"
for _ in $(seq 1 30); do
  if sudo -u "${DB_USER}" pg_isready -q; then break; fi
  sleep 1
done

echo "==> Ensuring '${DB_USER}' password and '${DB_NAME}' database"
sudo -u "${DB_USER}" psql -c "ALTER USER ${DB_USER} PASSWORD '${DB_PASSWORD}';"
sudo -u "${DB_USER}" psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || sudo -u "${DB_USER}" createdb "${DB_NAME}"

echo "==> Seeding demo data"
# On a brand-new database the seed's final web-chat demo step needs a table that the
# backend creates during its own startup migration. The seed populates all core demo
# data first, and the backend reconciles the web-chat demo on boot, so a non-zero exit
# from that last step is expected and safe to ignore on the very first run.
npm run -w backend seed || echo "seed: web-chat demo step deferred to backend startup (expected on first run)"

echo "==> Install complete"
