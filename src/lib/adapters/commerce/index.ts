/**
 * Commerce channel adapters (Shopify, etc.).
 *
 * These modules are the only place vendor-specific commerce code should live.
 * Domain, ledger, and dashboard metrics must not depend on Shopify types or APIs.
 *
 * See docs/architecture.md → "System of record & channel adapters".
 */

export {
  UnimplementedCommerceAdapter,
  getCommerceAdapter,
  listRegisteredCommerceAdapters,
  registerCommerceAdapter,
} from "./port";
export type { CommerceChannelAdapter } from "./port";
