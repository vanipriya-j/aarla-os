# Local database setup — Aarla OS

Aarla OS persists business state in PostgreSQL. Inventory quantities are **derived** from append-only `stock_movements`; they are never stored as balances.

## Connection

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Copy `.env.example` to `.env.local` (or export `DATABASE_URL` in your shell).

## Preferred: Supabase Local

When Docker allows:

```bash
npx supabase start
npm run db:migrate
npm run db:seed
```

`supabase start` typically exposes Postgres on port **54322**.

## Fallback: Docker Postgres container

```bash
npm run db:start    # starts or creates aarla-pg on 54322
npm run db:migrate
npm run db:seed
```

Or reset in one step:

```bash
npm run db:reset
```

Stop the container:

```bash
npm run db:stop
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run db:start` | Start `aarla-pg` (or create from `postgres:17`) on port 54322 |
| `npm run supabase:start` | Full Supabase Local stack when Docker supports it |
| `npm run db:migrate` | Apply `supabase/migrations/*.sql` via `tsx scripts/db-migrate.ts` |
| `npm run db:seed` | Truncate + seed demo data via `tsx scripts/seed-db.ts` |
| `npm run db:reset` | Recreate container if needed, migrate, seed |
| `npm run db:stop` | Stop `aarla-pg` |

## Architecture reminder

```
UI → Server Actions → Application Services → Business Engine → Repositories → Postgres
```

UI components must not import `pg` or a Supabase client. When the database is down, actions return `{ ok: false, error }` (or the home page shows a clear message).
