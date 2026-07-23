export * from "./types";
export * from "./catalog";
export {
  movementsSeed,
  deriveBalances,
  deriveInventorySnapshots,
  partnerStockFor,
  balanceAt,
  appendMovements,
  receiveAgainstPO,
  transferToPartner,
  recordPartnerSale,
  getMovements,
  getPurchaseOrders,
  upsertPurchaseOrder,
  createOrGetManufacturingPO,
  ensureSeededMovements,
  resetLedgerStorage,
  setMovementIdGenerator,
  LEDGER_STORAGE_KEYS,
} from "./ledger";
export type { AppendMovementInput } from "./ledger";
export { projectProductJourney } from "./journey";

export function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}
