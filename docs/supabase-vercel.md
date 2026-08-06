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

## 2. Copy the database URL (pooler)

Vercel cannot use the **direct** host (`db.*.supabase.co` — IPv6-only → timeouts / ENOTFOUND).

In Supabase: top bar **Connect** → copy a **pooler** URI.

Preferred for the running app: **Transaction pooler** (port **6543**):

```
postgresql://postgres.YOUR_REF:[YOUR-PASSWORD]@aws-0-REGION.pooler.supabase.com:6543/postgres
```

**Session pooler** (port **5432**) also works as a starting point — on Vercel the app **automatically** rewrites it to port **6543** (transaction mode) so you do not hit `max clients reached in session mode` (limit ~15).

Do **not** use:

- Project **API URL** (`https://….supabase.co`)
- Direct DB host (`db.….supabase.co`)

## 3. Add env vars on Vercel

Vercel → **aarla-os** → **Settings → Environment Variables**

Tick **Preview** and **Production**. No quotes around values.

| Name | Value |
|------|--------|
| `DATABASE_URL` | pooler URI from step 2 |
| `SETUP_SECRET` | invent a long random phrase (for `/setup` once) |
| `AUTH_ADMIN_PASSWORD` | admin login password (full access) |
| `AUTH_CRM_PASSWORD` | crm login password (Customer Calls only) |
| `AUTH_ADMIN_USERNAME` / `AUTH_CRM_USERNAME` | optional (default `admin` / `crm`) |

See `docs/auth.md` for role behaviour.

## 4. Redeploy

Deployments → **Redeploy** (env changes only apply after redeploy).

## 5. Initialize once

Open **https://aarla-os.vercel.app/setup**

1. Paste `SETUP_SECRET`
2. **Initialize database** (migrate + demo seed)
3. Open **Inventory** / Home

### If you see `max clients reached in session mode`

1. Wait **1–2 minutes** for old session connections to drop  
2. Merge/redeploy the build that uses Transaction pooler (port 6543) + pool size 1  
3. Retry

### If Home still shows an old DB error after setup

Home used to be statically baked at build time. Redeploy after tables exist (or use a build that calls Next `connection()` before DB reads).

## Architecture

```
Browser → Vercel (Next.js)
            → Server Actions
              → Business Engine
                → Postgres (Supabase Transaction pooler :6543)
```
