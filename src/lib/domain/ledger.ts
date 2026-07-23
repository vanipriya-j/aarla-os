import {
  LOC,
  batches,
  getLocation,
  locations,
  products,
  purchaseOrdersSeed,
} from "./catalog";
import type {
  InventoryBalance,
  InventorySnapshot,
  MovementType,
  PurchaseOrder,
  StockMovement,
} from "./types";

const MOVEMENTS_KEY = "aarla-os-ledger-movements-v1";
const POS_KEY = "aarla-os-purchase-orders-v1";

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  emit();
}

/**
 * Seed ledger — establishes opening balances for the unified catalog.
 * Inventory screens must derive from these movements (plus any LocalStorage appends).
 */
export const movementsSeed: StockMovement[] = [
  // --- Kolam Bottle batch KB-2026-07-01 ---
  {
    id: "mv-kol-receipt",
    date: "2026-07-12",
    productId: "prod-kolam-bottle",
    variantId: "var-kol-cream",
    batchId: "batch-kb-2026-07-01",
    quantity: 47,
    fromLocationId: LOC.external,
    toLocationId: LOC.studio,
    movementType: "Purchase Receipt",
    reference: "PO-KB-2401",
    notes: "47 accepted into Aarla Studio",
  },
  {
    id: "mv-kol-damage",
    date: "2026-07-12",
    productId: "prod-kolam-bottle",
    batchId: "batch-kb-2026-07-01",
    quantity: 3,
    fromLocationId: LOC.external,
    toLocationId: LOC.damage,
    movementType: "Damage",
    reference: "PO-KB-2401-QC",
    notes: "Rim dents — held",
  },
  {
    id: "mv-kol-nimalli",
    date: "2026-07-13",
    productId: "prod-kolam-bottle",
    batchId: "batch-kb-2026-07-01",
    quantity: 10,
    fromLocationId: LOC.studio,
    toLocationId: LOC.nimalli,
    movementType: "Transfer",
    reference: "TR-NIM-01",
    notes: "Partner transfer to Nimalli",
  },
  {
    id: "mv-kol-freshly",
    date: "2026-07-13",
    productId: "prod-kolam-bottle",
    batchId: "batch-kb-2026-07-01",
    quantity: 8,
    fromLocationId: LOC.studio,
    toLocationId: LOC.freshly,
    movementType: "Transfer",
    reference: "TR-FB-01",
    notes: "Café counter stock",
  },
  {
    id: "mv-kol-shopify",
    date: "2026-07-13",
    productId: "prod-kolam-bottle",
    batchId: "batch-kb-2026-07-01",
    quantity: 12,
    fromLocationId: LOC.studio,
    toLocationId: LOC.shopify,
    movementType: "Transfer",
    reference: "TR-SH-01",
    notes: "Allocated to Shopify fulfilment",
  },
  {
    id: "mv-kol-sale-vani",
    date: "2026-07-14",
    productId: "prod-kolam-bottle",
    batchId: "batch-kb-2026-07-01",
    quantity: 1,
    fromLocationId: LOC.shopify,
    toLocationId: LOC.sold,
    movementType: "Shopify Sale",
    reference: "ORD-KOL-01",
    notes: "Sold to Vanipriya",
  },
  {
    id: "mv-kol-sale-fb",
    date: "2026-07-16",
    productId: "prod-kolam-bottle",
    batchId: "batch-kb-2026-07-01",
    quantity: 1,
    fromLocationId: LOC.freshly,
    toLocationId: LOC.sold,
    movementType: "Partner Sale",
    reference: "FB-SALE-09",
    notes: "Partner sale at Freshly Brewed",
  },

  // --- Muruga Book ---
  {
    id: "mv-mb-receipt",
    date: "2026-06-22",
    productId: "prod-muruga-book",
    batchId: "batch-mb-2026-06-15",
    quantity: 198,
    fromLocationId: LOC.external,
    toLocationId: LOC.studio,
    movementType: "Purchase Receipt",
    reference: "PO-MB-0615",
    notes: "Book print run received",
  },
  {
    id: "mv-mb-damage",
    date: "2026-06-22",
    productId: "prod-muruga-book",
    batchId: "batch-mb-2026-06-15",
    quantity: 2,
    fromLocationId: LOC.external,
    toLocationId: LOC.damage,
    movementType: "Damage",
    reference: "PO-MB-0615-QC",
    notes: "Cover scuff",
  },
  {
    id: "mv-mb-freshly",
    date: "2026-07-15",
    productId: "prod-muruga-book",
    batchId: "batch-mb-2026-06-15",
    quantity: 12,
    fromLocationId: LOC.studio,
    toLocationId: LOC.freshly,
    movementType: "Transfer",
    reference: "TR-FB-MB",
    notes: "Shelf story display",
  },
  {
    id: "mv-mb-ngs",
    date: "2026-06-25",
    productId: "prod-muruga-book",
    batchId: "batch-mb-2026-06-15",
    quantity: 25,
    fromLocationId: LOC.studio,
    toLocationId: LOC.ngs,
    movementType: "Transfer",
    reference: "TR-NGS-MB",
    notes: "Opening stock",
  },
  {
    id: "mv-mb-shopify",
    date: "2026-07-01",
    productId: "prod-muruga-book",
    batchId: "batch-mb-2026-06-15",
    quantity: 40,
    fromLocationId: LOC.studio,
    toLocationId: LOC.shopify,
    movementType: "Transfer",
    reference: "TR-SH-MB",
    notes: "D2C allocation",
  },
  {
    id: "mv-mb-gift",
    date: "2026-07-10",
    productId: "prod-muruga-book",
    batchId: "batch-mb-2026-06-15",
    quantity: 1,
    fromLocationId: LOC.shopify,
    toLocationId: LOC.sold,
    movementType: "Gift",
    reference: "ORD-MB-01",
    notes: "Raghavan purchased · gifted to Ananya",
  },

  // --- Welcome Kit → Infosys ---
  {
    id: "mv-wk-receipt",
    date: "2026-07-10",
    productId: "prod-welcome-kit",
    batchId: "batch-wk-2026-07-05",
    quantity: 500,
    fromLocationId: LOC.external,
    toLocationId: LOC.studio,
    movementType: "Purchase Receipt",
    reference: "PO-WK-2405",
    notes: "Welcome kits received",
  },
  {
    id: "mv-wk-infosys",
    date: "2026-07-11",
    productId: "prod-welcome-kit",
    batchId: "batch-wk-2026-07-05",
    quantity: 500,
    fromLocationId: LOC.studio,
    toLocationId: LOC.infosys,
    movementType: "Corporate Allocation",
    reference: "ORD-INFO-500",
    notes: "Infosys welcome kits — users mostly unknown until registration",
  },

  // --- Opening studio stock for remaining catalog (simplified receipts) ---
  {
    id: "mv-mur-bot-open",
    date: "2026-06-01",
    productId: "prod-muruga-bottle",
    quantity: 42,
    fromLocationId: LOC.external,
    toLocationId: LOC.studio,
    movementType: "Purchase Receipt",
    reference: "OPEN-MUR-BOT",
    notes: "Opening studio stock",
  },
  {
    id: "mv-lak-open",
    date: "2026-06-15",
    productId: "prod-lakshmi-tumbler",
    quantity: 18,
    fromLocationId: LOC.external,
    toLocationId: LOC.studio,
    movementType: "Purchase Receipt",
    reference: "OPEN-LAK",
    notes: "Opening studio stock (partial prior PO)",
  },
  {
    id: "mv-gan-open",
    date: "2026-05-20",
    productId: "prod-ganapathi-magnets",
    quantity: 210,
    fromLocationId: LOC.external,
    toLocationId: LOC.studio,
    movementType: "Purchase Receipt",
    reference: "OPEN-GAN",
    notes: "Opening studio stock",
  },
  {
    id: "mv-tote-open",
    date: "2026-05-10",
    productId: "prod-chennai-tote",
    quantity: 64,
    fromLocationId: LOC.external,
    toLocationId: LOC.studio,
    movementType: "Purchase Receipt",
    reference: "OPEN-TOTE",
    notes: "Opening studio stock",
  },
  {
    id: "mv-tote-freshly",
    date: "2026-07-08",
    productId: "prod-chennai-tote",
    quantity: 6,
    fromLocationId: LOC.studio,
    toLocationId: LOC.freshly,
    movementType: "Transfer",
    reference: "TR-FB-TOTE",
    notes: "Partner transfer",
  },
  {
    id: "mv-tote-nimalli",
    date: "2026-07-08",
    productId: "prod-chennai-tote",
    quantity: 4,
    fromLocationId: LOC.studio,
    toLocationId: LOC.nimalli,
    movementType: "Transfer",
    reference: "TR-NIM-TOTE",
    notes: "Partner transfer",
  },
  {
    id: "mv-tray-open",
    date: "2026-04-01",
    productId: "prod-carnatic-tray",
    quantity: 11,
    fromLocationId: LOC.external,
    toLocationId: LOC.studio,
    movementType: "Purchase Receipt",
    reference: "OPEN-TRAY",
    notes: "Opening studio stock",
  },
  {
    id: "mv-pou-open",
    date: "2026-05-01",
    productId: "prod-bharatanatyam-pouch",
    quantity: 88,
    fromLocationId: LOC.external,
    toLocationId: LOC.studio,
    movementType: "Purchase Receipt",
    reference: "OPEN-POU",
    notes: "Opening studio stock",
  },
  {
    id: "mv-amm-open",
    date: "2026-05-15",
    productId: "prod-amman-book",
    quantity: 120,
    fromLocationId: LOC.external,
    toLocationId: LOC.studio,
    movementType: "Purchase Receipt",
    reference: "OPEN-AMM",
    notes: "Opening studio stock",
  },
  {
    id: "mv-art-open",
    date: "2026-03-20",
    productId: "prod-kolam-art",
    quantity: 7,
    fromLocationId: LOC.external,
    toLocationId: LOC.studio,
    movementType: "Purchase Receipt",
    reference: "OPEN-ART",
    notes: "Opening studio stock",
  },
];

/** Pure: derive location balances from an ordered movement list. */
export function deriveBalances(movements: StockMovement[]): InventoryBalance[] {
  const map = new Map<string, number>();
  const key = (productId: string, locationId: string) => `${productId}::${locationId}`;

  for (const m of movements) {
    if (m.quantity <= 0) continue;
    const fromKey = key(m.productId, m.fromLocationId);
    const toKey = key(m.productId, m.toLocationId);
    map.set(fromKey, (map.get(fromKey) ?? 0) - m.quantity);
    map.set(toKey, (map.get(toKey) ?? 0) + m.quantity);
  }

  const balances: InventoryBalance[] = [];
  for (const [k, quantity] of map.entries()) {
    if (quantity === 0) continue;
    const [productId, locationId] = k.split("::");
    balances.push({ productId, locationId, quantity });
  }
  return balances;
}

export function balanceAt(
  balances: InventoryBalance[],
  productId: string,
  locationId: string,
): number {
  return balances.find((b) => b.productId === productId && b.locationId === locationId)?.quantity ?? 0;
}

/** Snapshot used by Inventory UI and dashboard. */
export function deriveInventorySnapshots(movements: StockMovement[]): InventorySnapshot[] {
  const balances = deriveBalances(movements);
  const partnerLocIds = locations.filter((l) => l.kind === "Partner").map((l) => l.id);

  return products.map((p) => {
    const studioStock = Math.max(balanceAt(balances, p.id, LOC.studio), 0);
    const partnerStock = partnerLocIds.reduce(
      (sum, locId) => sum + Math.max(balanceAt(balances, p.id, locId), 0),
      0,
    );
    const channelStock = Math.max(balanceAt(balances, p.id, LOC.shopify), 0);
    const damaged = Math.max(balanceAt(balances, p.id, LOC.damage), 0);
    const reserved = channelStock; // Shopify pool treated as reserved for fulfilment
    const available = studioStock;
    const totalOnHand = studioStock + partnerStock + channelStock;

    return {
      productId: p.id,
      studioStock,
      partnerStock,
      channelStock,
      reserved,
      damaged,
      available,
      totalOnHand,
    };
  });
}

export function partnerStockFor(
  movements: StockMovement[],
  partnerId: string,
): { productId: string; quantity: number }[] {
  const loc = locations.find((l) => l.partnerId === partnerId);
  if (!loc) return [];
  const balances = deriveBalances(movements).filter(
    (b) => b.locationId === loc.id && b.quantity > 0,
  );
  return balances.map((b) => ({ productId: b.productId, quantity: b.quantity }));
}

export function registrationsFromPartner(partnerId: string, regCountFallback: number) {
  return regCountFallback;
}

function newMovementId() {
  return `mv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface AppendMovementInput {
  productId: string;
  variantId?: string;
  batchId?: string;
  quantity: number;
  fromLocationId: string;
  toLocationId: string;
  movementType: MovementType;
  reference: string;
  notes: string;
  date?: string;
}

export function getMovements(): StockMovement[] {
  return readJson(MOVEMENTS_KEY, movementsSeed);
}

export function getPurchaseOrders(): PurchaseOrder[] {
  return readJson(POS_KEY, purchaseOrdersSeed);
}

export function appendMovements(entries: AppendMovementInput[]): StockMovement[] {
  const current = getMovements();
  const created: StockMovement[] = entries.map((e) => ({
    id: newMovementId(),
    date: e.date ?? new Date().toISOString().slice(0, 10),
    productId: e.productId,
    variantId: e.variantId,
    batchId: e.batchId,
    quantity: e.quantity,
    fromLocationId: e.fromLocationId,
    toLocationId: e.toLocationId,
    movementType: e.movementType,
    reference: e.reference,
    notes: e.notes,
  }));
  const next = [...created, ...current];
  writeJson(MOVEMENTS_KEY, next);
  return created;
}

export function upsertPurchaseOrder(po: PurchaseOrder) {
  const current = getPurchaseOrders();
  const idx = current.findIndex((p) => p.id === po.id);
  const next =
    idx >= 0 ? current.map((p, i) => (i === idx ? po : p)) : [po, ...current];
  writeJson(POS_KEY, next);
  return po;
}

export function receiveAgainstPO(input: {
  poId: string;
  accepted: number;
  damaged: number;
  missing: number;
  notes: string;
}): { movements: StockMovement[]; purchaseOrder: PurchaseOrder } | null {
  const pos = getPurchaseOrders();
  const po = pos.find((p) => p.id === input.poId);
  if (!po) return null;

  const batch =
    batches.find((b) => b.id === po.batchId) ??
    batches.find((b) => b.productId === po.productId);

  const movements: AppendMovementInput[] = [];
  if (input.accepted > 0) {
    movements.push({
      productId: po.productId,
      batchId: batch?.id,
      quantity: input.accepted,
      fromLocationId: LOC.external,
      toLocationId: LOC.studio,
      movementType: "Purchase Receipt",
      reference: po.id,
      notes: input.notes || `Received ${input.accepted} accepted units`,
    });
  }
  if (input.damaged > 0) {
    movements.push({
      productId: po.productId,
      batchId: batch?.id,
      quantity: input.damaged,
      fromLocationId: LOC.external,
      toLocationId: LOC.damage,
      movementType: "Damage",
      reference: `${po.id}-QC`,
      notes: `${input.damaged} damaged on receive`,
    });
  }

  const created = movements.length ? appendMovements(movements) : [];
  const quantityReceived = po.quantityReceived + input.accepted;
  const status =
    quantityReceived >= po.quantityOrdered
      ? "Received"
      : quantityReceived > 0
        ? "Partial"
        : po.status;

  const updated = upsertPurchaseOrder({
    ...po,
    quantityReceived,
    status,
  });

  return { movements: created, purchaseOrder: updated };
}

export function transferToPartner(input: {
  productId: string;
  partnerId: string;
  quantity: number;
  notes?: string;
}): StockMovement | null {
  const loc = locations.find((l) => l.partnerId === input.partnerId);
  if (!loc || input.quantity <= 0) return null;

  const snapshots = deriveInventorySnapshots(getMovements());
  const snap = snapshots.find((s) => s.productId === input.productId);
  if (!snap || snap.available < input.quantity) return null;

  const batch = batches.find((b) => b.productId === input.productId);
  const [created] = appendMovements([
    {
      productId: input.productId,
      batchId: batch?.id,
      quantity: input.quantity,
      fromLocationId: LOC.studio,
      toLocationId: loc.id,
      movementType: "Transfer",
      reference: `TR-${input.partnerId.toUpperCase().replace("PARTNER-", "")}-${Date.now().toString().slice(-4)}`,
      notes: input.notes || `Transfer to ${getLocation(loc.id)?.name ?? input.partnerId}`,
    },
  ]);
  return created;
}

export function recordPartnerSale(input: {
  productId: string;
  partnerId: string;
  quantity: number;
  notes?: string;
}): StockMovement | null {
  const loc = locations.find((l) => l.partnerId === input.partnerId);
  if (!loc || input.quantity <= 0) return null;
  const bal = balanceAt(deriveBalances(getMovements()), input.productId, loc.id);
  if (bal < input.quantity) return null;

  const batch = batches.find((b) => b.productId === input.productId);
  const [created] = appendMovements([
    {
      productId: input.productId,
      batchId: batch?.id,
      quantity: input.quantity,
      fromLocationId: loc.id,
      toLocationId: LOC.sold,
      movementType: "Partner Sale",
      reference: `PSALE-${Date.now().toString().slice(-6)}`,
      notes: input.notes || "Partner sale",
    },
  ]);
  return created;
}

function getMovementsSnapshot() {
  return JSON.stringify(readJson(MOVEMENTS_KEY, movementsSeed));
}

function getPOsSnapshot() {
  return JSON.stringify(readJson(POS_KEY, purchaseOrdersSeed));
}

function getServerSnapshot() {
  return "";
}

export const ledgerStore = {
  subscribe,
  getMovementsSnapshot,
  getPOsSnapshot,
  getServerSnapshot,
};
