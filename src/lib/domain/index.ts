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
export {
  getVariantAvailability,
  getProductAvailability,
  variantsMatchingOption,
} from "./inventory-availability";
export type { SoftHold, VariantAvailability } from "./inventory-availability";
export {
  buildReplenishmentCycles,
  computeVariantSalesPace,
  salesPaceLabel,
} from "./inventory-sales-pace";
export type {
  SalesPaceClass,
  VariantSalesPace,
  ReplenishmentCycle,
  MatchedSaleLine,
  InboundReceipt,
} from "./inventory-sales-pace";
export { getVariantAging, ageBandForDays, AGE_BANDS } from "./inventory-aging";
export type { VariantAging, AgeBand } from "./inventory-aging";
export {
  computeInventoryHealth,
  inventoryHealthLabel,
} from "./inventory-health";
export type { InventoryHealth, InventoryHealthAction } from "./inventory-health";

export function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}
