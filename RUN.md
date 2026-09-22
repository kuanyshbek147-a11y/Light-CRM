# Local run (WhatsApp CRM MVP)

Stack: **Node.js 20+**, **React + Vite** (`frontend`), **Express + PostgreSQL** (`backend`). Optional: Docker Compose (`infra/docker-compose.yml`).

## Quick start (no Docker)

```bash
# 1) Dependencies
npm install

# 2) Env files from examples (safe placeholders; no real secrets)
npm run setup:env

# 3) PostgreSQL with database `whatsapp_crm`
#    user/password: postgres/postgres  (or match infra/.env)
#    macOS: brew services start postgresql
#    Ubuntu: sudo service postgresql start
#    Then: createdb -U postgres whatsapp_crm   # if missing

# 4) Seed demo users + schema
npm run seed

# 5) Backend (port 4000)
npm run -w backend dev

# 6) Frontend (port 5173) — second terminal
npm run -w frontend dev
```

Verify:

- API health: http://localhost:4000/health → `{"ok":true}`
- UI: http://localhost:5173

Demo logins:

- `manager@demo.local` / `demo123`
- `admin@demo.local` / `demo123`

## Docker (recommended if Docker Desktop is installed)

```bash
npm install
npm run setup:env          # optional integrations; compose no longer requires files
npm run docker:up
```

- UI: http://localhost:5173  
- Health: http://localhost:4000/health  

Stop: `npm run docker:down` · Reset DB volumes: `npm run docker:reset`

## Env files (what to fill)

| File | Purpose |
|------|---------|
| `infra/.env.example` → `infra/.env` | Backend DB/JWT + optional integrations |
| `infra/meta.secrets.env.example` → `infra/meta.secrets.env` | Meta/WhatsApp tokens (optional) |
| `frontend/.env.example` → `frontend/.env` | `VITE_API_URL=http://localhost:4000/api` |

Integrations (WhatsApp / Telegram / Instagram / OpenAI) are **optional** for opening the CRM UI locally. Leave blanks until you need them.

For a shared machine, replace `EMAIL_CREDENTIALS_KEY` and `JWT_SECRET` with your own values (`openssl rand -hex 32`).

## Known blockers / notes

- Without `npm run setup:env`, older Docker Compose versions that require `env_file` paths may still fail — use Compose v2.24+ (supports `required: false`) or run `setup:env`.
- Seed must succeed before first useful login; it now applies schema migrations before demo webchat setup.
- Local frontend without `VITE_API_URL` now defaults to `http://localhost:4000/api` (previously it pointed at production Render).
- Root `npm run dev` starts **backend only**; use `npm run -w frontend dev` for the UI.
- Production deploy (Render + Netlify) is documented in the main README; not required for local launch.
