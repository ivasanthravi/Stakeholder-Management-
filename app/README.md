# Meridian

A multi-tenant stakeholder-intelligence workspace: a React 19 client (Vite), a Hono API, PostgreSQL via Drizzle, and Better Auth.

## Quick start (development)

Requires Node 20+. No database install is needed: development uses an embedded Postgres (PGlite) in `.data/`.

```bash
npm install
cp .env.example .env
npm run db:seed
npm run dev
```

- `npm run db:seed` applies migrations and loads the **synthetic** sample workspace.
- `npm run dev` starts the API on :8787 and the app on http://localhost:5173.

Sample accounts (development only), all with the password `meridian-sample-2026`:

| Email | Role |
|---|---|
| rhea@sample.meridian.test | Owner |
| tom@sample.meridian.test | Administrator |
| mei@sample.meridian.test | Manager |
| daniel@sample.meridian.test | Contributor |
| sara@sample.meridian.test | Viewer |

**Email in development.** No email is sent. Verification, reset and invitation messages are stored and shown at http://localhost:5173/dev/mail.

## Scripts
| Script | What it does |
|---|---|
| `npm run dev` | API (tsx watch) and Vite together |
| `npm run typecheck` | Client and server TypeScript |
| `npm test` | Vitest: unit, integration, tenant isolation (in-memory Postgres per file) |
| `npm run test:e2e` | Playwright against an isolated stack on :5199/:8799 with a fresh database (uses installed Google Chrome) |
| `npm run db:generate` | Generate a migration from `server/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` / `db:reset` | Seed sample data / wipe `.data` and reseed |
| `npm run build` / `npm start` | Production build, then serve API and client from one process |

## Database & migrations
- The schema is in `server/db/schema.ts`. Migrations live in `server/db/migrations/`:
  - `0000_init.sql` is generated.
  - `0001_rls.sql` is hand-written: row-level security, the `app_user` role, and append-only audit.
- **Migrations run automatically** on server start (`migrate()` is idempotent and tracked in `drizzle.__drizzle_migrations`). `npm run db:migrate` runs them explicitly.
- **Rollback.** Migrations are forward-only. To roll back, write a new migration that reverses the change. Never edit an applied migration. Take a backup (`pg_dump`) before applying migrations in production.
- **Recovery.** Production should use managed Postgres with point-in-time recovery. PGlite data in `.data/` is for development only and is safe to delete (`npm run db:reset`).

## Production
Required environment (see `.env.example`):

| Variable | Notes |
|---|---|
| `NODE_ENV=production` | — |
| `DATABASE_URL` | Postgres 15+. The connecting role must be able to `CREATE ROLE`/`GRANT` for the RLS migration, or a DBA must pre-create `app_user` and grant membership to it |
| `AUTH_SECRET` | 32+ random characters, e.g. `openssl rand -base64 48` |
| `APP_URL` | The public origin, e.g. `https://app.example.com`. Cookies are `Secure` in production |

Then:

```bash
npm run build
npm start
```

This serves `/api/*` and the built client on `PORT` (default 8787) behind a TLS-terminating proxy.

**Not yet production-ready.** There is no email transport (only the dev log mailer), and the deployment has not been security-reviewed. See [`../docs/implementation/known-limitations.md`](../docs/implementation/known-limitations.md).

## Layout
```
server/   Hono app: auth.ts, context.ts (session, tenant gate, idempotency), modules/* (one per domain), db/ (schema, migrations, seed)
shared/   Zod schemas and the permission matrix, used by server and client
src/      React client: api/ (fetch + TanStack Query hooks), session/, shell/, screens/, forms/, components/
tests/    Vitest suites (unit, workflow, tenancy)
e2e/      Playwright core-flow spec
audit/    Headless-Chrome screenshot, interaction and performance scripts
```

Docs: [`../docs/implementation/`](../docs/implementation/) (Phase 1 report, decisions, tests, visual QA, limitations) and [`../docs/architecture/api.md`](../docs/architecture/api.md).
