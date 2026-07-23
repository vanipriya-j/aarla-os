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
  /** Sale from the D2C channel location pool. Named historically; channel adapters must still write via the ledger. */
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
}

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

/**
 * Commerce channel id (Shopify is one possible adapter, not the SoR).
 * Prefer stable string ids so new channels can be added without domain churn.
 */
export type CommerceChannelId = "shopify" | "whatsapp" | "wholesale" | "manual" | (string & {});

export type SalesOrderStatus =
  | "Open"
  | "Paid"
  | "PartiallyFulfilled"
  | "Fulfilled"
  | "Cancelled";

/** Line on a canonical SalesOrder — always references Aarla OS product IDs. */
export interface SalesOrderLine {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
  titleSnapshot?: string;
}

/**
 * Canonical sales order — system of record for D2C / channel sales.
 * External platforms (e.g. Shopify) import into this shape; they do not own it.
 */
export interface SalesOrder {
  id: string;
  channelId: CommerceChannelId;
  /** External platform order id (e.g. Shopify order gid / number). */
  externalOrderId?: string;
  /** May be unknown at sale time — registration later creates a known User. */
  customerPersonId?: string;
  customerNameSnapshot?: string;
  lines: SalesOrderLine[];
  orderedAt: string;
  status: SalesOrderStatus;
  fulfilmentStatus?: string;
  currency: "INR";
  total: number;
  notes?: string;
}

/** Maps an external channel catalog row onto a canonical Product / Variant. */
export interface ChannelProductMapping {
  channelId: CommerceChannelId;
  externalProductId: string;
  externalVariantId?: string;
  productId: string;
  variantId?: string;
}

/**
 * Visible, auditable conflict when channel data disagrees with Aarla OS.
 * Screens must surface these — never silently prefer the channel.
 */
export interface CommerceSyncConflict {
  id: string;
  channelId: CommerceChannelId;
  entityType: "Product" | "Order" | "Inventory" | "Fulfilment";
  externalId: string;
  canonicalId?: string;
  detectedAt: string;
  summary: string;
  status: "Open" | "Resolved" | "Ignored";
}
