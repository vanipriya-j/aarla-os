# Supabase + Vercel setup — Aarla OS

One repo. Vercel hosts the **Next.js app**. Supabase hosts the **Postgres database**.  
UI still never talks to Supabase directly — only the Business Engine / repositories use Postgres.

## 1. Create a Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project** → name it e.g. `aarla-os`
3. Set a strong database password (save it)
4. Pick a region close to your Vercel region
5. Wait until the project is ready

## 2. Copy the database URL

In Supabase:

**Project Settings → Database → Connection string → URI**

Prefer the **direct** connection (host like `db.<project-ref>.supabase.co`, port **5432**) for this app, because we use SQL transactions.

It looks like:

```
postgresql://postgres:[YOUR-PASSWORD]@db.[ref].supabase.co:5432/postgres
```

Session pooler (port 5432 on `*.pooler.supabase.com`) also works if direct is blocked; avoid the transaction pooler (port 6543) for migrate/seed.

Replace `[YOUR-PASSWORD]` with the real password (URL-encode special characters if needed).

Optional (Studio / future clients), also copy:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (server only; never expose to the browser)

## 3. Migrate + seed the cloud database (once)

From your laptop (with the repo):

```bash
export DATABASE_URL='postgresql://postgres:YOUR_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres'

npm run db:migrate
npm run db:seed
```

You should see product/movement counts in the seed log.

## 4. Add env vars on Vercel

Vercel → your **aarla-os** project → **Settings → Environment Variables**

| Name | Value | Environments |
|------|--------|----------------|
| `DATABASE_URL` | the Supabase Postgres URI from step 2 | Production, Preview, Development |

Optional:

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR_REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (server only) |

## 5. Redeploy

Deployments → **Redeploy** the latest production deployment  
(or push a commit).

Open https://aarla-os.vercel.app/inventory — you should see seeded stock, not endless “Loading…”.

## Local still works

```bash
cp .env.example .env.local
# keep local DATABASE_URL pointing at Docker/Supabase Local
npm run db:start && npm run db:migrate && npm run db:seed
npm run dev
```

Use **cloud** `DATABASE_URL` only when talking to Supabase Cloud. Don’t commit secrets.

## Architecture (unchanged)

```
Browser → Vercel (Next.js)
            → Server Actions
              → Business Engine
                → Postgres repositories
                  → Supabase Postgres
```

No second GitHub repo. No UI imports of the Supabase client for business data.
