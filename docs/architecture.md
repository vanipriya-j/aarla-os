# Architecture — Aarla OS (unified domain + local Postgres)

## Stack

- Next.js App Router · TypeScript · Tailwind CSS v4 · lucide-react
- **PostgreSQL** via Supabase Local migrations (Docker Postgres on port 54322 in constrained environments)
- No auth, no cloud Supabase project, no live Shopify

## Runtime architecture

```
UI (screens unchanged visually)
  → Server Actions (`src/app/actions`)
    → Application Services (`src/lib/application`)
      → Business Engine (`src/lib/engine`)   ← only mutator of business state
        → Repository interfaces (`src/lib/repositories`)
          → Postgres adapters (`src/lib/infra/repositories`)
            → Local PostgreSQL
```

UI components must **not** import `pg` or a Supabase client.

## Domain spine

```
Catalog (Postgres)
  Product · Vendor · Location · Batch · Partner · Person …
        │
        ▼
Stock Movement Ledger (append-only, Postgres)
        │
        ├── Inventory balances (derived in Business Engine)
        ├── Partner stock (derived)
        ├── Journey / Traceability (projected)
        └── Dashboard capital-in-inventory (derived)
```

Inventory quantities are **never** stored as editable balances. Corrections use compensating movements. Stock movements are immutable after commit (DB triggers reject UPDATE/DELETE).

### Canonical modules

| Module | Path | Role |
|--------|------|------|
| Types | `src/lib/domain/types.ts` | Unified domain types |
| Pure ledger math | `src/lib/domain/ledger.ts` | `deriveBalances` / snapshots (no I/O) |
| Journey | `src/lib/domain/journey.ts` | Projection from movements + registrations |
| Business Engine | `src/lib/engine/business-engine.ts` | Validation + mutations |
| Repositories | `src/lib/repositories` + `infra/repositories` | Persistence |
| Seed sources | `scripts/seed-db.ts` (+ catalog/mock arrays as seed input only) | Local DB init |

### Writers (Business Engine)

- **Manufacture** → `PurchaseOrder` (no stock yet)
- **Receive** → `Purchase Receipt` + `Damage` movements (+ PO update) in a transaction
- **Partner Transfer** → `Transfer` Studio → Partner location
- **Partner Sale** → `Partner Sale` Partner location → Sold
- **Register** → Person upsert + `product_registrations`

### Invariants

1. Inventory balances are derived from movements.
2. One Product code / one Vendor code everywhere (UUID PK + stable `code`).
3. Customer ≠ User; registration creates known User.
4. Every business row has `organization_id`.
5. Channel platforms are adapters later — not SoR (see persistence plan).

## Local database

See `docs/local-database.md` and `docs/persistence-migration-plan.md`.

```bash
npm run db:start     # Docker Postgres on 54322 (or supabase start when available)
npm run db:migrate
npm run db:seed
npm run dev          # requires DATABASE_URL
```

## Testing

```bash
npm test             # Vitest (includes Postgres persistence tests when DATABASE_URL set)
npm run test:e2e     # Playwright smoke + persistence reload
npm run build && npm run lint
```

## Not yet

- Live Shopify / Delhivery / messaging adapters
- Supabase Cloud
- Auth users
- RAG / LLM
- Speculative tables (decisions / memories / evidence)
