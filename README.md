# Aarla OS

**Aarla OS** is a founder operating system for [Aarla](https://aarla.in) — a cultural lifestyle brand. Version 0.2 adds the **product network & traceability** domain (People, Partners, Inventory, Registrations, Product Journey) on top of the v0.1 workflows from idea → manufacturing → launch → content → fulfilment → review.

Business state persists in **PostgreSQL** (local Docker for development; **Supabase Cloud** for Vercel). There is no authentication and no live Shopify.

## How to run (local)

```bash
npm install
cp .env.example .env.local
npm run db:start      # local Postgres on 54322 (Docker)
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build         # production build
npm run start         # serve production build (needs DATABASE_URL)
npm run lint          # eslint
npm test              # Vitest (domain + Postgres persistence)
npm run test:e2e      # Playwright smoke + persistence reload
npm run test:all      # Vitest + Playwright
npm run db:reset      # migrate + seed
```

- Local DB: `docs/local-database.md`
- **Vercel + Supabase Cloud:** `docs/supabase-vercel.md`
- Migration plan: `docs/persistence-migration-plan.md`

## Project structure

```
src/
  app/                 # App Router pages (home + 10 workflows)
  components/
    layout/            # Sidebar, Header, AppShell
    ui/                # Shared UI primitives
    home/              # Ask Aarla command bar
  lib/
    application/       # Use cases
    engine/            # Business Engine (only mutator)
    repositories/      # Persistence interfaces
    infra/             # Postgres pool + adapters
    domain/            # Types + pure projectors
    client/            # useAppLedger / useAppNetwork
  app/actions/         # Server actions (UI entry to services)
supabase/              # Migrations + seed hook for Supabase Local
scripts/               # db-migrate + seed-db
docs/                  # Product & architecture
```

### Primary workflows

| Tile | Route |
|------|-------|
| Need Advice | `/advice` |
| Explore an Idea | `/explore` |
| Your Story. Our Telling. | `/story` |
| Manufacture / Reorder | `/manufacture` |
| Receive Stock | `/receive` |
| Dispatch Orders | `/dispatch` |
| Launch Products | `/launch` |
| Content Studio | `/content` |
| Projects | `/projects` |
| Business Dashboard | `/dashboard` |

## Domain + persistence

- **One Product catalog** and **one Vendor model** (Postgres)
- **Stock Movement Ledger** (append-only Postgres); inventory is **derived**
- UI → Server Actions → Application Services → Business Engine → Repositories → Postgres
- Manufacture / Receive / Transfer / Partner Sale / Register persist through the Business Engine

See `docs/architecture.md` and `docs/product-network.md`.

## Current limitations

- No auth yet (anyone with the Vercel URL can use the app if deployed)
- No live Shopify, Delhivery, email, or WhatsApp integrations
- Some home/dashboard chart figures are seeded **demo metrics** (labeled), not live commerce
- Explore idea generation is a local helper (not an LLM)
- Desktop-first; mobile uses a collapsible nav

## Suggested next steps

1. Create Supabase Cloud project + set `DATABASE_URL` on Vercel (`docs/supabase-vercel.md`)
2. Real Shopify order sync and inventory webhooks
3. Vendor email / WhatsApp send with audit trail
4. Barcode print via label printer drivers
5. Role-aware views if a small team grows beyond a single founder
6. Automated advice grounded in live inventory + seasonality

## Design

Warm cream surfaces, Aarla red actions, deep navy headings, DM Serif Display + Inter. See `docs/design-system.md`.

## Docs

- `docs/vision.md`
- `docs/product.md`
- `docs/design-system.md`
- `docs/glossary.md`
- `docs/workflows.md`
- `docs/architecture.md`
- `docs/local-database.md`
- `docs/supabase-vercel.md`
