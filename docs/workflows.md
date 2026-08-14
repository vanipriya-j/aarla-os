# Workflows

## 1. Need Advice (`/advice`)

Chat-style founder copilot with sample prompts. Returns mocked intelligent answers from Aarla inventory / seasonality / capital data. Actions: Create Project, Start Manufacturing, Review Inventory, Build Hamper, Add to Priorities.

## 2. Explore an Idea (`/explore`)

Input a theme (e.g. Muruga). Output groups: Worlds, Stories, Objects, Experiences, Customer segments, Existing products, Product opportunities (with MOQ, unit cost, capital, vendor), Relevant vendors. Select opportunities → convert to project.

## 3. Your Story. Our Telling. (`/story`)

Capture client brief (occasion, story, qty, budget, deadline, location, branding, personalisation). Generate three hamper options with products, packaging, cost, sell price, margin, inventory, manufacture needs, lead time. Convert selection to project.

## 4. Manufacture / Reorder (`/manufacture`)

Modes: new / reorder / quick. Vendor forms for bottles and magnets. Previews: PO, spec sheet, email, WhatsApp, attachment checklist. Approve and Send simulation.

## 5. Receive Stock (`/receive`)

Steps: select PO → quantities → QC (+ photo placeholder) → discrepancy / refund-replacement → barcode generate/print/attach → shelf → mark ready for Shopify.

## 6. Dispatch Orders (`/dispatch`)

Pending Shopify orders table. Flow: select → confirm products → packaging checklist → generate shipment → schedule pickup → generate/print label → mark packed → mark dispatched.

## 7. Launch Products (`/launch`)

Per-SKU checklist: name, category, world, story, description, price, cost, margin, inventory, photos, barcode, Shopify, content, launch date. Shows readiness % and blockers.

## 8. Content Studio (`/content`)

Formats: Instagram, Reel, LinkedIn, Pinterest, WhatsApp, Product story, Founder video, Culture Conversation, Aarla Pick. Create tasks with product/world/platform/format/due/status/caption/assets. Board + calendar views.

## 9. Projects (`/projects`)

Sample projects with status, deadline, budget, capital, products, vendors, tasks, MOs, content, risks, notes. Detail pages at `/projects/[id]`.

## 10. This Week (`/weekly`)

Weekly operating board (Mon–Sun, `Asia/Kolkata`): are we doing what we need to do this week?

- **Orders & revenue** — from live `external_orders` (`is_valid`, INR). Shows today, week-to-date, daily average, weekly target, and a Mon–Sun daily strip.
- **Followers & views** — manual entry for the week (`operating_manual_metrics`). Not pulled from Instagram APIs yet.
- **Targets** — org defaults in `operating_targets` (+50 followers/week, 50k views/week, 5 orders/day, ₹3500/day). Status chips: ON TRACK / AT RISK / BEHIND / DONE from pace vs expected-by-now.
- **Retailers** — active Retail Partner + Café locations; completed = Transfer into that partner location during the week.
- **Vendors** — open POs vs Received this week (links to `/manufacture`).
- Nav label **This Week**; Business Dashboard (`/dashboard`) is unchanged. No AI/RAG.

After deploy, run `/setup` with **Load demo data unchecked** so `operating_*` tables exist without wiping commerce data.

## 11. GST Reconciliation (`/finance/gst`)

Monthly GST **preparation** board — not GST filing / GSTN software and not tax advice.

- **Sales** — valid INR `external_orders` in the selected FY month, with tax columns from Shopify sync (`cgst` / `sgst` / `igst`, taxable, shipping tax, refunds). Missing tax fields surface as exceptions; amounts are never invented.
- **Purchases** — manual tax-invoice bills (`purchase_bills`), separate from manufacturing POs. Arithmetic and duplicate checks flag blockers.
- **Period status** — Collecting → Needs Review → Ready. **Mark Sent** on an accountant pack sets Sent (download + mark-sent channel).
- **Accountant pack** — immutable Excel snapshot (Summary, Sales, Purchases, Refunds / Credits, Exceptions, Source Summary). Download the file and share outside the app.
- After deploy, **re-sync Shopify** (full or incremental catch-up) so order tax columns populate. Run `/setup` (migrations only) for GST tables.

## 12. Business Dashboard (`/dashboard`)

Revenue, orders, AOV, margin, capital blocked, fast/slow movers, pending manufacturing, receivables, upcoming launches, channel mix, mock revenue chart.

## 13. Inventory & Replenishment (`/inventory`)

Tabs: **Stock** | **Replenishment** | **Locations** | **Movements** (deep-link with `?tab=`; the old `?tab=products` and `?tab=batches` still resolve — to Stock and Locations respectively).

- **Stock** — products grouped by category. `resolvePresentation()` picks the layout per product: `matrix-apparel` (Colour × Size), `matrix-art` (Design × Format), or a plain variant `list`. Every cell/row shows the variant's total on-hand and is clickable; a "low" marker/chip appears when a variant falls under its `ReorderRule` minimum. Clicking opens the **Variant Stock Detail** drawer — total, available (=Studio), reserved (=Channel/Shopify), damaged, and a full by-location breakdown — with **Transfer** and **Adjust** actions.
- **Transfer** — From location / To location / Quantity / notes → `transferStock({ productId, variantId, fromLocationId, toLocationId, quantity, notes })`. Writes a `Transfer` movement; fails safely (no movement written) if the source location doesn't have enough stock.
- **Adjust** — pick a location, see its system quantity, enter a physical count and a reason (`missing` | `damaged` | `count correction` | `other`) → `adjustStock({ productId, variantId, locationId, systemQty, physicalQty, reason, notes })`. Writes a compensating `Adjustment` movement for the delta only (no-op when the count matches).
- **Replenishment** — `computeReplenishment()` turns reorder rules + ledger balances into three worklists: **A. Aarla Low Stock** (studio under minimum), **B. Partner Replenishment Needed** (a specific partner under its partner-scoped minimum), **C. Global Low Stock** (studio + partner combined under minimum). Each row suggests Transfer (opens the Transfer modal, prefilled Studio ⇄ partner) or Manufacture/Reorder (links to `/manufacture`).
- **Locations / Movements** — read-only location cards (with a folded-in Batches table) and the full movement ledger, unchanged from the prior Inventory screen.
- Shopify is never double-counted: the Shopify/Channel location is treated purely as `reserved` stock already derived from the ledger — there is no separate call to the Shopify inventory API from this screen.
- Soft **Shopify Reserve** (WhatsApp / checkout assist) uses `POST /api/integrations/shopify/reservations` — see `docs/shopify-connector.md`. That path stores a soft hold in `channel_reservations` and does **not** write `stock_movements` or change Channel reserved qty.
