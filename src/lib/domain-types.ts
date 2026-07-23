/** Aarla OS v0.2 — Product Network & Traceability domain model */

export type PersonRole = "Customer" | "User" | "Community Member";

export type OrganizationType = "Corporate" | "School" | "Institution" | "Event Organizer";

export type PartnerType =
  | "Retail Partner"
  | "Reseller"
  | "Pop-up"
  | "Café"
  | "Event"
  | "Distributor";

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

export interface Partner {
  id: string;
  name: string;
  partnerType: PartnerType;
  location: string;
  contact: string;
  paymentStatus: "Current" | "Pending" | "Overdue";
  margin: number;
  currentInventory: { productId: string; quantity: number }[];
  replenishmentHistory: { date: string; productId: string; quantity: number; note: string }[];
  merchandisingNotes: string;
  displayPhotos: string[];
  registeredUsersOriginatingHere: number;
  productsSold: number;
}

export interface NetworkVendor {
  id: string;
  company: string;
  contact: string;
  category: string;
  leadTime: number;
  purchaseOrders: string[];
  qualityRating: number;
  city?: string;
}

export interface ProductVariant {
  id: string;
  label: string;
  sku: string;
}

export interface NetworkProduct {
  id: string;
  sku: string;
  title: string;
  category: string;
  world: string;
  story: string;
  variants: ProductVariant[];
  currentInventory: number;
  registrations: number;
  currentLifecycleStatus: LifecycleStatus;
  sellingPrice: number;
  cost: number;
  ideaOrigin: string;
  designedDate: string;
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

export interface InventoryLocation {
  id: string;
  name: string;
  kind: "Studio" | "Partner" | "Channel" | "Corporate";
  partnerId?: string;
}

export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  variantId?: string;
  batchId: string;
  quantity: number;
  fromLocationId: string;
  toLocationId: string;
  movementType: MovementType;
  reference: string;
  notes: string;
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

export interface InventorySnapshot {
  productId: string;
  studioStock: number;
  partnerStock: number;
  reserved: number;
  damaged: number;
  available: number;
}

export interface JourneyStage {
  id: string;
  label: string;
  detail: string;
  href?: string;
  tone?: "default" | "accent" | "muted" | "success" | "warning";
}
