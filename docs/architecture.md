# Architecture — Aarla OS (unified domain)

## Stack

- Next.js App Router · TypeScript · Tailwind CSS v4 · lucide-react
- Local mock data + LocalStorage for ledger / people / registrations
- No auth, database, or live integrations

## System of record & channel adapters

**Aarla OS is the canonical system of record** for catalog, inventory, orders, customers, fulfilment, partners and registrations.

External commerce platforms such as **Shopify are channel adapters**, not sources of business truth.

```
                    ┌─────────────────────────────┐
                    │     Aarla OS (canonical)    │
                    │  Catalog · Ledger · Orders  │
                    │  People · Partners · Regs   │
                    └──────────────▲──────────────┘
                                   │
              import SalesOrders · map catalog IDs
              write stock ONLY via ledger
              push fulfilment updates outward
                                   │
                    ┌──────────────┴──────────────┐
                    │  CommerceChannelAdapter     │
                    │  (Shopify | future channel) │
                    └─────────────────────────────┘
```

### Rules (preserve even before Shopify is wired)

1. Shopify products / variants **map to** canonical Aarla OS Product / Variant IDs (`ChannelProductMapping`).
2. Shopify orders are **imported** as canonical `SalesOrder` records — never treated as the order SoR.
3. Inventory movements are written **only** through the Aarla OS ledger (`appendMovements` / domain writers).
4. Fulfilment and shipment updates may be **synchronized back** to the channel via `pushFulfilmentUpdate`.
5. Conflicts are first-class (`CommerceSyncConflict`) — visible and auditable; never silently prefer the channel.
6. **No screen** may calculate business metrics from raw Shopify (or other channel) payloads. Derive from catalog, ledger, SalesOrders, people/registrations.
7. The adapter is **replaceable** (`CommerceChannelAdapter` in `src/lib/adapters/commerce`). UI and domain must not hard-depend on Shopify types.

### Seam modules (no live Shopify yet)

| Module | Path | Role |
|--------|------|------|
| SalesOrder & mappings | `src/lib/domain/types.ts` | Canonical order + channel mapping + conflict types |
| SalesOrder helpers | `src/lib/domain/sales-orders.ts` | Validate lines against catalog; ledger reference helpers |
| Adapter port | `src/lib/adapters/commerce/` | Replaceable channel interface + unimplemented stub |

Dispatch still uses `shopifyOrders` mock fixtures for the pack UI — labelled as demo only, not SoR.

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
| Ops data | `src/lib/mock-data.ts` | Projects, content, **demo** channel fixtures, advice |

### Writers (ledger)

- **Manufacture** → creates/updates `PurchaseOrder` (no stock yet)
- **Receive** → `Purchase Receipt` + `Damage` movements
- **Partner Transfer** → `Transfer` Studio → Partner location
- **Partner Sale** → `Partner Sale` Partner location → Sold
- **Channel / D2C sale** (future from SalesOrder import) → ledger movement from channel pool → Sold

### Invariants

1. Inventory balances are never stored as source of truth — they are derived from movements.
2. One Product id / one Vendor id everywhere.
3. Customer ≠ User; registration creates known User.
4. Sold/allocated without registration ⇒ In Circulation – User Unknown.
5. Channel platforms never own inventory truth or order truth inside Aarla OS.

## Presentation

- `AppShell` + Sidebar/Header
- Workflow pages under `src/app/*`
- Network pages: people, partners, inventory, products, register, registrations

## Not yet

- Live Shopify / Delhivery / messaging adapter implementations
- Party / ProductInstance abstractions
- Full LocalStorage for all ops entities
- Phase 2 feature work
