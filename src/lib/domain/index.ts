export * from "./types";
export * from "./catalog";
export {
  movementsSeed,
  deriveBalances,
  deriveInventorySnapshots,
  deriveVariantLocationBreakdown,
  deriveVariantTotals,
  partnerStockFor,
  balanceAt,
  appendMovements,
  receiveAgainstPO,
  transferToPartner,
  recordPartnerSale,
  buildTransferMovement,
  buildAdjustmentMovement,
  getMovements,
  getPurchaseOrders,
  upsertPurchaseOrder,
  createOrGetManufacturingPO,
  ensureSeededMovements,
  resetLedgerStorage,
  setMovementIdGenerator,
  LEDGER_STORAGE_KEYS,
  DEFAULT_INVENTORY_LOC,
} from "./ledger";
export type { AppendMovementInput, BuildAdjustmentMovementInput, InventoryLocCodes } from "./ledger";
export { projectProductJourney } from "./journey";
export {
  resolvePresentation,
  buildApparelMatrix,
  buildArtMatrix,
  listVariantRows,
} from "./inventory-presentation";
export type { ApparelMatrixRow, ArtMatrixRow, VariantRow } from "./inventory-presentation";
export { computeReplenishment } from "./inventory-replenishment";
export type { ReplenishmentItem } from "./inventory-replenishment";

export function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}
