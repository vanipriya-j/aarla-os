# Supabase + Vercel setup — Aarla OS (no laptop needed)

One repo. Vercel hosts the **Next.js app**. Supabase hosts the **Postgres database**.  
You do this entirely in the browser — no local install, Docker, or CLI.

UI still never talks to Supabase directly — only the Business Engine / repositories use Postgres.

## 1. Create a Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project** → name it e.g. `aarla-os`
3. Set a strong database password (**save it**)
4. Pick a region close to your Vercel region
5. Wait until the project is ready

## 2. Copy the database URL

In Supabase:

**Project Settings → Database → Connection string → URI**

Prefer the **direct** connection (host like `db.<project-ref>.supabase.co`, port **5432**).

```
postgresql://postgres:[YOUR-PASSWORD]@db.[ref].supabase.co:5432/postgres
```

Replace `[YOUR-PASSWORD]` with the real password (URL-encode special characters if needed).

## 3. Add env vars on Vercel

Vercel → your **aarla-os** project → **Settings → Environment Variables**

| Name | Value | Environments |
|------|--------|----------------|
| `DATABASE_URL` | the Supabase Postgres URI from step 2 | Production, Preview |
| `SETUP_SECRET` | invent a long random phrase (you will type it once) | Production, Preview |

Optional later:

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR_REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (server only) |

## 4. Redeploy

Deployments → **Redeploy** the latest production deployment  
(or merge/push so a new deploy runs).

## 5. Initialize from the website

Open:

**https://aarla-os.vercel.app/setup**

1. Confirm both `DATABASE_URL` and `SETUP_SECRET` show as **set**
2. Paste the same secret you put in Vercel
3. Leave “Load demo data” checked
4. Click **Initialize database**
5. Open **Inventory** — you should see seeded stock, not endless “Loading…”

You can remove `SETUP_SECRET` from Vercel afterward (or leave it for rare resets). Re-running initialize with seed **wipes and reloads** demo data.

## Architecture

```
Browser → Vercel (Next.js)
            → Server Actions /api/setup
              → Business Engine / bootstrap
                → Postgres repositories
                  → Supabase Postgres
```

No second GitHub repo. No local machine required for the first cloud bring-up.

## If you *do* have a machine later

Local Docker still works for development:

```bash
cp .env.example .env.local
npm run db:start && npm run db:migrate && npm run db:seed
npm run dev
```

Or point `DATABASE_URL` at Supabase Cloud and run `npm run db:migrate` / `db:seed` from a laptop.
