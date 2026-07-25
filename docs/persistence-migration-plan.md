# Persistence migration plan — Aarla OS → Supabase Local

Sprint scope: local PostgreSQL via Supabase Local; migrate all business data; preserve UI; wire flows through Application Services → Business Engine → Repositories. No RAG, no LLM, no redesign, no Supabase Cloud.

---

## 1. Repository audit

### 1.1 Mock / seed / dummy files

| File | Role | Entities (approx.) |
|------|------|--------------------|
| `src/lib/domain/catalog.ts` | Canonical static catalog | locations 9, products 11, vendors 6, batches 4, POs 6, partners 3, orgs 2, people 5, regs 5 |
| `src/lib/domain/ledger.ts` | Opening ledger + LS writers | movementsSeed 25 |
| `src/lib/mock-data.ts` | Ops/workflow fixtures | shopifyOrders 5, projects 5, contentTasks 5, priorities 4, attentionItems 4, dashboardMetrics, revenueByMonth 7, channelMix 5, sampleAdvice, launchChecklists 3, packaging checklist, tipPrompts |
| `src/lib/network-data.ts` | Deprecated facade over catalog/ledger | aliases only |
| `src/app/story/page.tsx` | Inline `mockOptions` | 3 hamper options |
| `src/test/fixtures/builders.ts` | Test factories | — |

### 1.2 LocalStorage keys

| Key | Data | Modules |
|-----|------|---------|
| `aarla-os-ledger-movements-v1` | `StockMovement[]` | `ledger.ts`, `use-ledger.ts` |
| `aarla-os-purchase-orders-v1` | `PurchaseOrder[]` | `ledger.ts`, `use-ledger.ts` |
| `aarla-os-ledger-seeded-v1` | seed flag | `ledger.ts` |
| `aarla-os-v02-people` | `Person[]` | `storage.ts` / `useNetworkStore` |
| `aarla-os-v02-registrations` | `ProductRegistration[]` | `storage.ts` / `useNetworkStore` |

### 1.3 Dual / parallel sources of truth (must collapse)

1. Live LS POs vs home `purchaseOrders` seed re-export.
2. Live LS people/regs vs dashboard/partners reading `peopleSeed` / `registrationsSeed`.
3. Partner stock from ledger vs static `Partner.productsSold` / `replenishmentHistory`.
4. Shopify fixture orders (names) vs ledger Shopify Sale movements (product ids) — unlinked.
5. Story hamper inventory strings vs ledger snapshots.

### 1.4 Domain spine (keep)

- One product/vendor catalog.
- Append-only stock movement ledger; inventory **derived**.
- Writers: manufacture PO, receive (+ damage), transfer, partner sale, register product.
- Journey projected from movements + registrations.

### 1.5 Routes

| Route | Reads today | Writes today |
|-------|-------------|--------------|
| `/` | mock-data | none |
| `/dashboard` | ledger + mock + seed people/regs | none |
| `/inventory` | ledger | seed-once LS |
| `/manufacture` | ledger | PO → LS |
| `/receive` | ledger | movements + PO → LS |
| `/partners` | ledger + seed regs | transfer/sale → LS |
| `/register` | catalog + network store | people + regs → LS |
| `/registrations`, `/people`, `/people/[id]` | network store | none |
| `/products/[id]` | ledger + network store | none |
| `/content`, `/dispatch`, `/launch` | mock → React state | client-only |
| `/projects`, `/projects/[id]` | mock | none |
| `/explore`, `/advice`, `/story` | mock / simulated | client-only |

### 1.6 Layers today

**None.** Pages call hooks/writers directly. No repositories, application services, or business engine.

### 1.7 Tests depending on mocks/LS

- Vitest: `ledger-reducers`, `ledger-integration`, `journey`, `screen-consistency` (+ LocalStorage setup).
- Playwright: `e2e/phase01-smoke.spec.ts` clears `localStorage`.

### 1.8 Not in app (do not create tables)

`decisions`, `memories`, `evidence`, auth `users` (no login), RAG/LLM stores. Commerce adapter / `SalesOrder` seam may exist on another branch — not required for this sprint’s screens beyond dispatch fixtures.

---

## 2. Proposed schema

Tenant: single seeded organization **Aarla** (`organizations`).

All business tables include `organization_id` → `organizations(id)`.

Identifiers: UUID PKs + stable `code` text (unique per org) preserving today’s string ids (`prod-kolam-bottle`, `vendor-sizzle`, …) for URLs and seed familiarity. Deterministic UUIDs via UUID v5 in seed scripts.

| Table | Purpose | Notes |
|-------|---------|-------|
| `organizations` | Tenant | Seed Aarla |
| `products` | Catalog | + `product_variants` |
| `product_variants` | SKU variants | FK product |
| `vendors` | Suppliers | |
| `locations` | Studio / partner / channel / hold | `partner_id` nullable |
| `partners` | Partner metadata | Stock via locations + ledger |
| `institutions` | Corporate/school parties (Infosys, Kumon) | Former `Organization` type |
| `manufacturing_batches` | Batches | |
| `purchase_orders` | Single-line POs (matches today’s model) | No separate items table |
| `stock_movements` | Append-only ledger | **No UPDATE of qty/type after insert**; compensating movements for corrections |
| `people` | Customers / users / community | |
| `product_registrations` | Registrations | FK product, person, optional partner/institution |
| `projects` | Projects screen | |
| `content_tasks` | Content studio | |
| `channel_orders` | Dispatch demo orders | Labeled demonstration |
| `launch_checklists` + `launch_checklist_items` | Launch screen | |
| `home_priorities` | Home priorities | |
| `home_attention_items` | Home attention | |
| `demo_metric_snapshots` | Revenue/channel/dashboard demo numbers | Labeled demonstration — not SoR for inventory |
| `advice_snippets` | Canned advice copy | Not LLM; demo content for `/advice` |
| `story_hamper_options` | Story screen options | Demo |

**Explicitly omitted:** editable `inventory_balances` table; `purchase_order_items`; `users` auth; `decisions` / `memories` / `evidence`.

Timestamps: `created_at` / `updated_at` where mutable; movements get `created_at` only (immutable).

Indexes: FKs, `(organization_id, code)`, movements `(organization_id, product_id)`, `(organization_id, from_location_id)`, `(organization_id, to_location_id)`, registrations `(organization_id, product_id)`.

---

## 3. Mock / LocalStorage → table mapping

| Source | Target |
|--------|--------|
| `catalog.products` (+ variants) | `products`, `product_variants` |
| `catalog.vendors` | `vendors` |
| `catalog.locations` / `LOC` | `locations` |
| `catalog.partners` | `partners` (+ location `partner_id`) |
| `catalog.organizations` | `institutions` |
| `catalog.batches` | `manufacturing_batches` |
| `catalog.purchaseOrdersSeed` + LS POs | `purchase_orders` |
| `ledger.movementsSeed` + LS movements | `stock_movements` |
| `catalog.peopleSeed` + LS people | `people` |
| `catalog.registrationsSeed` + LS regs | `product_registrations` |
| `mock-data.projects` | `projects` |
| `mock-data.contentTasks` | `content_tasks` |
| `mock-data.shopifyOrders` | `channel_orders` (+ line items JSON or child table) |
| `mock-data.launchChecklists` | `launch_checklists` / items |
| `mock-data.priorities` | `home_priorities` |
| `mock-data.attentionItems` | `home_attention_items` |
| `mock-data.dashboardMetrics`, `revenueByMonth`, `channelMix` | `demo_metric_snapshots` (kind discriminator) |
| `mock-data.sampleAdvice`, `tipPrompts` | `advice_snippets` |
| `story.mockOptions` | `story_hamper_options` |
| LocalStorage keys | **Removed** as business-state after cutover |

Inventory quantities: **not stored** — derived from `stock_movements` in the Business Engine (port of `deriveBalances` / `deriveInventorySnapshots`).

---

## 4. Files expected to change

**Add**

- `supabase/config.toml`, `supabase/migrations/*.sql`, `supabase/seed.sql` (or `supabase/seed/*.ts`)
- `src/lib/repositories/*.ts` (interfaces)
- `src/lib/engine/*.ts` (mutations + derivation)
- `src/lib/application/*.ts` (use cases)
- `src/lib/infra/db/*` (Supabase server client; env-based)
- `src/lib/infra/repositories/*` (Postgres adapters)
- `src/app/actions/*.ts` (server actions — UI entry, no direct Supabase in components)
- `docs/local-database.md`, `.env.example`
- DB-backed Vitest + Playwright persistence e2e

**Update**

- All `src/app/**/page.tsx` that read mock/LS
- `use-ledger.ts` / `storage.ts` → thin clients over server actions or remove
- `package.json` scripts (`db:start`, `db:reset`, `db:seed`, …)
- README / architecture docs
- Existing tests (no production mock arrays / browser LS for business state)

**Remove from runtime**

- Runtime reads of `movementsSeed` / `purchaseOrdersSeed` / `peopleSeed` / `registrationsSeed` / ops mocks as SoT
- LocalStorage business writes
- Keep seed **scripts** only for DB init + tests

---

## 5. Target architecture

```
UI (unchanged visually)
  → Server Actions / Application Services
    → Business Engine (only mutator of business state)
      → Repository interfaces
        → Supabase Local PostgreSQL adapters
```

Rules:

- Only Business Engine mutates business state.
- Repositories persist only; no domain rules inside adapters.
- Components never import Supabase client.
- Clear failure when DB unavailable (`DATABASE_URL` / Supabase URL missing or connection error).

---

## 6. Risks and assumptions

| Risk / assumption | Mitigation |
|-------------------|------------|
| Heavy `"use client"` pages | Server Actions + small client hooks; avoid full redesign |
| UUID mandate vs familiar string ids | UUID PK + stable `code` for routes |
| Dual dashboard metrics (fake revenue vs ledger capital) | Seed demo metrics labeled; inventory/capital from ledger |
| Advice/Explore/Story are simulated AI | Persist canned content as demo snippets; no LLM calls; copy clarifies demo |
| Dispatch orders unlinked from ledger | Seed as `channel_orders` demo; fulfilment status client→DB; stock still ledger-only |
| Docker required for Supabase Local | Document; fail clearly if unavailable |
| Test suite branch base | Implement on branch from current Phase 0–1 + tests codebase |
| Single-tenant demo | One `organization_id` for all seed rows |
| Immutable movements | DB: no update of movement business columns; engine only inserts |
| Playwright against prod server | Keep; point at DB-backed app |

---

## 7. Implementation steps (reviewable)

1. Scaffold Supabase Local + env + docs.
2. Migration SQL (schema only).
3. Seed script reproducing current demo state.
4. Repository interfaces + Postgres adapters + connection health check.
5. Business Engine: port ledger derivation + writers (transactions).
6. Application services + server actions.
7. Wire screens in batches: catalog/inventory/manufacture/receive → partners/register/people → dashboard/home → projects/content/dispatch/launch → advice/explore/story.
8. Remove LS + runtime mock SoT.
9. Update unit/integration/e2e tests; add persistence e2e.
10. `build` + `lint` + `test` + `test:e2e`.

---

## 8. Non-goals (sprint)

- Supabase Cloud
- RAG / LLM
- Navigation or visual redesign
- Generic ERP modules
- Speculative tables (decisions/memories/evidence/auth users)
