/**
 * @deprecated Import from `@/lib/domain` instead.
 * Thin compatibility facade during Phase 0/1 unification.
 */
export {
  products as networkProducts,
  vendors as networkVendors,
  batches,
  locations,
  partners,
  organizations,
  peopleSeed,
  registrationsSeed,
  getProductTitle,
  getLocationName,
  getPersonName,
  getPartnerName,
  getVendorName,
} from "./domain/catalog";

export { movementsSeed as stockMovements, deriveInventorySnapshots as getInventorySnapshots } from "./domain/ledger";
export { projectProductJourney as buildProductJourney } from "./domain/journey";
