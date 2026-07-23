# Architecture — Aarla OS (unified domain)

## Stack

- Next.js App Router · TypeScript · Tailwind CSS v4 · lucide-react
- Local mock data + LocalStorage for ledger / people / registrations
- No auth, database, or live integrations

## Domain spine (Phase 0–1)

```
Catalog (static)
  Product · Vendor · Location · Batch · Partner · Person …
        │
        ▼
Stock Movement Ledger (append-only, LocalStorage)
        │
        ├── Inventory balances (derived)
        ├── Partner stock (derived)
        ├── Journey / Traceability (projected)
        └── Dashboard capital-in-inventory (derived)
```

### Canonical modules

| Module | Path | Role |
|--------|------|------|
| Types | `src/lib/domain/types.ts` | Unified domain types |
| Catalog | `src/lib/domain/catalog.ts` | One Product + Vendor catalog, locations, batches |
| Ledger | `src/lib/domain/ledger.ts` | Movements, PO store, derive balances, writers |
| Journey | `src/lib/domain/journey.ts` | Journey projection from ledger + registrations |
| Ops data | `src/lib/mock-data.ts` | Projects, content, Shopify UI fixtures, advice |

### Writers (ledger)

- **Manufacture** → creates/updates `PurchaseOrder` (no stock yet)
- **Receive** → `Purchase Receipt` + `Damage` movements
- **Partner Transfer** → `Transfer` Studio → Partner location
- **Partner Sale** → `Partner Sale` Partner location → Sold

### Invariants

1. Inventory balances are never stored as source of truth — they are derived from movements.
2. One Product id / one Vendor id everywhere.
3. Customer ≠ User; registration creates known User.
4. Sold/allocated without registration ⇒ In Circulation – User Unknown.

## Presentation

- `AppShell` + Sidebar/Header
- Workflow pages under `src/app/*`
- Network pages: people, partners, inventory, products, register, registrations

## Testing (Phase 0–1)

Frameworks: **Vitest** (domain + LocalStorage integration), **React Testing Library** (screen-consistency harness), **Playwright** (critical browser smoke).

```bash
npm test              # Vitest unit + integration + RTL (Phase 0–1)
npm run build && npm start   # production server (needed for Playwright)
npm run test:e2e      # Playwright smoke (manufacture → receive → transfer → sale → registration)
npm run test:all      # Vitest + Playwright
```

Playwright uses `next start` (see `playwright.config.ts`). Run `npm run build` first; `next dev` may not hydrate reliably in some environments.
Fixtures/builders live in `src/test/fixtures/builders.ts`. Ledger tests inject deterministic movement IDs via `setMovementIdGenerator` and reset storage with `resetLedgerStorage`.

Coverage targets the Phase 0–1 invariants (single catalog/ledger, receive/damage/transfer/sale, derived inventory & journey, idempotent writers, non-negative stock, seed-once, corrupt LocalStorage recovery, screen consistency).

## Not yet

- Shopify / Delhivery / messaging adapters
- Party / ProductInstance abstractions
- Full LocalStorage for all ops entities
- Phase 2 feature work
