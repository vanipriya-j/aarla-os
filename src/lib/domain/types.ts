/**
 * Aarla OS — unified domain types (Phase 0/1)
 * One Product catalog · One Vendor model · One Stock Movement Ledger
 */

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

export type LifecycleStatus =
  | "Designed"
  | "Manufactured"
  | "Received"
  | "In Inventory"
  | "Transferred"
  | "Sold"
  | "Delivered"
  | "In Circulation"
  | "In Circulation – User Unknown"
  | "Registered"
  | "Community";

export type MovementType =
  | "Purchase Receipt"
  | "Transfer"
  | "Shopify Sale"
  | "Partner Sale"
  | "Studio Sale"
  | "Corporate Allocation"
  | "Gift"
  | "Sample"
  | "Return"
  | "Replacement"
  | "Damage"
  | "Adjustment";

export type PurchaseOrderStatus =
  | "Draft"
  | "Sent"
  | "In Production"
  | "Shipped"
  | "Received"
  | "Partial";

export interface ProductVariant {
  id: string;
  label: string;
  sku: string;
  /** Structured attributes for category matrices — e.g. { Size: "M", Colour: "Black" } or { Format: "8x10" }. */
  options?: Record<string, string>;
}

/** Inventory screen presentation hint — "auto" infers from category/options. */
export type InventoryPresentation = "auto" | "matrix-apparel" | "matrix-art" | "list";

/** Canonical sellable product (single catalog). */
export interface Product {
  id: string;
  sku: string;
  title: string;
  category: string;
  world: string;
  story: string;
  variants: ProductVariant[];
  sellingPrice: number;
  cost: number;
  /** Merchandising hint only — not inventory truth. */
  velocity: "Fast" | "Steady" | "Slow";
  status: string;
  ideaOrigin?: string;
  designedDate?: string;
  /** Optional override for how Inventory renders this product's variants. */
  inventoryPresentation?: InventoryPresentation;
  /** Shopify product id (numeric or GID) when synced from catalog. */
  shopifyProductId?: string | null;
  /** Deep link to edit this product in Shopify Admin (set when listing catalog). */
  shopifyAdminUrl?: string | null;
}

/** Canonical supply-side vendor. */
export interface Vendor {
  id: string;
  name: string;
  city: string;
  category: string;
  contact: string;
  moq: number;
  leadTimeDays: number;
  qualityRating: number;
}

export interface Location {
  id: string;
  name: string;
  kind: "Studio" | "Partner" | "Channel" | "Hold" | "External";
  partnerId?: string;
}

export interface ManufacturingBatch {
  id: string;
  batchNumber: string;
  productId: string;
  vendorId: string;
  manufactureDate: string;
  receivedDate: string;
  quantityProduced: number;
  accepted: number;
  damaged: number;
  notes: string;
}

export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  variantId?: string;
  batchId?: string;
  quantity: number;
  fromLocationId: string;
  toLocationId: string;
  movementType: MovementType;
  reference: string;
  notes: string;
}

export interface PurchaseOrder {
  id: string;
  vendorId: string;
  productId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  status: PurchaseOrderStatus;
  requiredDate: string;
  orderedDate: string;
  batchId?: string;
}

/** Derived from the ledger — never stored as source of truth. */
export interface InventoryBalance {
  productId: string;
  /** Empty string ("") when the movement did not carry a variant. */
  variantId: string;
  locationId: string;
  quantity: number;
}

export interface InventorySnapshot {
  productId: string;
  studioStock: number;
  partnerStock: number;
  channelStock: number;
  reserved: number;
  damaged: number;
  available: number;
  totalOnHand: number;
}

/** Reason codes for manual stock adjustments (count corrections, damage, loss). */
export type AdjustmentReason = "missing" | "damaged" | "count correction" | "other";

/** Configurable minimum-stock rule — product and/or variant, optionally scoped to a partner. */
export interface ReorderRule {
  id: string;
  productId: string;
  variantId?: string | null;
  partnerId?: string | null;
  minQuantity: number;
  notes?: string;
}

/** Variant-aware stock breakdown for a single product+variant across all locations. */
export interface VariantStockCell {
  productId: string;
  variantId: string;
  total: number;
  studio: number;
  partner: number;
  /** Shopify/channel pool — treated as reserved for fulfilment. */
  channel: number;
  damaged: number;
  /** Studio stock — what's actually sellable/transferable right now. */
  available: number;
  /** Alias for `channel` — kept explicit for UI clarity. */
  reserved: number;
  byLocation: { locationId: string; locationName: string; kind: string; quantity: number }[];
}

export type PersonRole = "Customer" | "User" | "Community Member";
export type PartnerType =
  | "Retail Partner"
  | "Reseller"
  | "Pop-up"
  | "Café"
  | "Event"
  | "Distributor";
export type OrganizationType = "Corporate" | "School" | "Institution" | "Event Organizer";
export type PurchaseSource =
  | "Website"
  | "Studio"
  | "Retail Partner"
  | "Corporate Gift"
  | "School"
  | "Event"
  | "Gift"
  | "Other";
export type Interest =
  | "Carnatic Music"
  | "Bharatanatyam"
  | "Festivals"
  | "Temple Arts"
  | "Chennai"
  | "Children's Books"
  | "Home & Living";

export interface Person {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  roles: PersonRole[];
  interests: Interest[];
  purchasedOrders: string[];
  ownedProducts: string[];
  registeredProducts: string[];
  createdAt: string;
  timeline?: { date: string; label: string; href?: string }[];
}

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  contact: string;
  orders: string[];
  usersReached: number;
  city?: string;
}

/** Channel partner metadata — stock comes from the ledger via partner locations. */
export interface Partner {
  id: string;
  name: string;
  partnerType: PartnerType;
  location: string;
  contact: string;
  paymentStatus: "Current" | "Pending" | "Overdue";
  margin: number;
  replenishmentHistory: { date: string; productId: string; quantity: number; note: string }[];
  merchandisingNotes: string;
  displayPhotos: string[];
  productsSold: number;
}

export interface ProductRegistration {
  registrationId: string;
  productId: string;
  batchId: string;
  customerId?: string;
  organizationId?: string;
  userId: string;
  partnerId?: string;
  purchaseSource: PurchaseSource;
  registrationDate: string;
  registrationCode: string;
  status: "Registered" | "Community";
}

export interface JourneyStage {
  id: string;
  label: string;
  detail: string;
  href?: string;
  tone?: "default" | "accent" | "muted" | "success" | "warning";
}
