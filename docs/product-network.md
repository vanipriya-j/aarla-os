# Product Network & Traceability

## Domain spine (Phase 0–1 complete)

Aarla OS now uses:

1. **One Product catalog** — `src/lib/domain/catalog.ts`
2. **One Vendor model** — same catalog
3. **One Stock Movement Ledger** — `src/lib/domain/ledger.ts` (LocalStorage)
4. **Derived inventory** — studio / partner / channel / damaged / available

Journey and Traceability are **projections** (`src/lib/domain/journey.ts`), not independently maintained trees.

### Writers

| Action | Writes |
|--------|--------|
| Manufacture → Approve & Send | `PurchaseOrder` (status Sent) |
| Receive → Confirm | `Purchase Receipt` + `Damage` movements |
| Partner → Transfer Stock | `Transfer` movement |
| Partner → Record Sale | `Partner Sale` movement |

### Signature product

`/products/prod-kolam-bottle` — Kolam Bottle journey from the ledger.

### Customer vs User

Unchanged: Customer pays; User owns/uses; registration creates known User; otherwise **In Circulation – User Unknown**.

### Still deferred

- Shopify / Delhivery adapters
- Party / ProductInstance abstractions
- Full ops persistence beyond ledger + people/registrations
