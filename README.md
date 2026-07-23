# Aarla OS

**Aarla OS** is a founder operating system for [Aarla](https://aarla.in) — a cultural lifestyle brand. Version 0.2 adds the **product network & traceability** domain (People, Partners, Inventory, Registrations, Product Journey) on top of the v0.1 workflows from idea → manufacturing → launch → content → fulfilment → review.

This build uses **local mock data only**. There is no authentication, database, backend, or live third-party integration.

## How to run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm run start   # serve production build
npm run lint    # eslint
```

## Project structure

```
src/
  app/                 # App Router pages (home + 10 workflows)
  components/
    layout/            # Sidebar, Header, AppShell
    ui/                # Shared UI primitives
    home/              # Ask Aarla command bar
  lib/
    types.ts           # Shared TypeScript types
    mock-data.ts       # Realistic Aarla mock data
    navigation.ts      # Primary tiles + sidebar nav
docs/                  # Product & design context
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

## Domain unification (Phase 0–1)

- **One Product catalog** and **one Vendor model** in `src/lib/domain/catalog.ts`
- **Stock Movement Ledger** in `src/lib/domain/ledger.ts` (LocalStorage)
- Inventory balances, partner stock, journey, and capital-in-inventory are **derived**
- Manufacture writes Purchase Orders; Receive / Partner Transfer / Partner Sale write ledger movements
- **Aarla OS is the system of record**; Shopify (and other commerce platforms) are future **channel adapters** only — see `docs/architecture.md`

See `docs/architecture.md` and `docs/product-network.md`.

## Current limitations (v0.2)

- Mock data + LocalStorage only — no auth, database, or API routes
- No live Shopify, Delhivery, email, or WhatsApp integrations (previews / fixtures are simulated)
- Charts are CSS-based mock visualisations
- Desktop-first; mobile uses a collapsible nav

## Suggested next steps

1. Persist projects / POs / content tasks locally (e.g. IndexedDB) before adding a backend
2. Implement a replaceable commerce adapter that imports Shopify → `SalesOrder` and writes stock only via the ledger
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
