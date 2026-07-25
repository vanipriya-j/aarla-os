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

## 2. Copy the database URL (Session pooler)

Vercel cannot reliably reach Supabase’s **direct** host (`db.*.supabase.co`) — that often times out (IPv6). Use the **Session pooler** instead.

In Supabase:

**Project Settings → Database → Connection string**

1. Method: **Session pooler** (not “Direct connection”, not “Transaction”)
2. Type: **URI**
3. Copy it — it looks like:

```
postgresql://postgres.YOUR_REF:[YOUR-PASSWORD]@aws-0-REGION.pooler.supabase.com:5432/postgres
```

Notes:

- Host contains `pooler.supabase.com` and port is **5432**
- Username is often `postgres.YOUR_REF` (with a dot), not just `postgres`
- Replace `[YOUR-PASSWORD]` (URL-encode special characters if needed)

## 3. Add env vars on Vercel

Vercel → your **aarla-os** project → **Settings → Environment Variables**

Tick **Preview** and **Production**. No quotes around values.

| Name | Value | Environments |
|------|--------|----------------|
| `DATABASE_URL` | Session pooler URI from step 2 | Production, Preview |
| `SETUP_SECRET` | invent a long random phrase (you will type it once) | Production, Preview |

## 4. Redeploy

Deployments → **Redeploy** this Preview (or Production after merge).  
Env var changes do nothing until you redeploy.

## 5. Initialize from the website

Preview (until PR merges):

**https://aarla-os-git-cursor-supabase-cloud-vercel-8083-aarla.vercel.app/setup**

Production (after merge):

**https://aarla-os.vercel.app/setup**

1. Confirm both `DATABASE_URL` and `SETUP_SECRET` show as **set**
2. Paste the same secret you put in Vercel
3. Leave “Load demo data” checked
4. Click **Initialize database**
5. Open **Inventory** — you should see seeded stock, not endless “Loading…”

You can remove `SETUP_SECRET` from Vercel afterward (or leave it for rare resets). Re-running initialize with seed **wipes and reloads** demo data.

### If you see “timeout expired”

Your `DATABASE_URL` is almost certainly the **direct** URI. Switch to **Session pooler**, update Vercel, redeploy, retry.

## Architecture

```
Browser → Vercel (Next.js)
            → Server Actions /api/setup
              → Business Engine / bootstrap
                → Postgres repositories
                  → Supabase Postgres (Session pooler)
```

No second GitHub repo. No local machine required for the first cloud bring-up.

## If you *do* have a machine later

Local Docker still works for development:

```bash
cp .env.example .env.local
npm run db:start && npm run db:migrate && npm run db:seed
npm run dev
```
