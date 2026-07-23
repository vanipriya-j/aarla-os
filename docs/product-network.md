# Product Network & Traceability (v0.2)

Aarla OS understands the full journey of every product:

Idea → Design → Vendor → Manufacturing → Inventory → Partner / Shopify → Customer → User → Community

## Customer vs User

- **Customer** places the order and pays.
- **User** owns or uses the product (may receive as gift / corporate / school).
- A Customer may also be a User. A User is not always a Customer.
- Sold ≠ known User. Association happens only after **registration**.
- Unregistered sold goods sit as **In Circulation – User Unknown**.

## New routes

| Screen | Path |
|--------|------|
| People | `/people`, `/people/[id]` |
| Partners | `/partners` |
| Inventory | `/inventory` |
| Product Journey | `/products/[id]` |
| Register | `/register` |
| Registrations | `/registrations` |

## Domain files

- `src/lib/domain-types.ts` — Person, Organization, Partner, Vendor, Product, Batch, Location, StockMovement, Registration
- `src/lib/network-data.ts` — seed mock data (Kolam Bottle, Infosys kits, Freshly Brewed, etc.)
- `src/lib/storage.ts` — LocalStorage persistence for people + registrations

## Signature experience

Open **Kolam Bottle** at `/products/np-kolam` → Journey + Traceability tabs.
