#!/usr/bin/env bash
# Per-boot startup for the WhatsApp CRM MVP.
# Brings PostgreSQL online and makes sure the database + demo data exist.
# The backend/frontend dev servers run as named terminals (see environment.json).
set -euo pipefail

PG_VERSION=16
DB_NAME=whatsapp_crm
DB_USER=postgres

echo "==> Starting PostgreSQL cluster (tolerate already running)"
sudo pg_ctlcluster "${PG_VERSION}" main start 2>/dev/null || true

echo "==> Waiting for PostgreSQL to accept connections"
for _ in $(seq 1 30); do
  if sudo -u "${DB_USER}" pg_isready -q; then break; fi
  sleep 1
done

echo "==> Ensuring '${DB_NAME}' database exists"
sudo -u "${DB_USER}" psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || sudo -u "${DB_USER}" createdb "${DB_NAME}"

echo "==> Ensuring demo data (idempotent)"
npm run -w backend seed || echo "seed: web-chat demo step deferred to backend startup (expected on first run)"

echo "==> Startup complete"
