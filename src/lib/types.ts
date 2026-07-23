/**
 * Ops / workflow types (projects, content, dispatch UI).
 * Catalog & ledger types live in `@/lib/domain`.
 */
export type { StatusTone } from "./domain/types";

export type ProjectStatus =
  | "Ideation"
  | "Planning"
  | "In Progress"
  | "Manufacturing"
  | "Launch Ready"
  | "Completed"
  | "On Hold";

export type OrderPaymentStatus = "Paid" | "Pending" | "COD" | "Refunded";
export type CourierStatus =
  | "Awaiting Pack"
  | "Packed"
  | "Pickup Scheduled"
  | "In Transit"
  | "Delivered";

export type ContentStatus =
  | "Idea"
  | "Draft"
  | "In Production"
  | "Review"
  | "Scheduled"
  | "Published";

export type ContentFormat =
  | "Instagram post"
  | "Reel"
  | "LinkedIn post"
  | "Pinterest post"
  | "WhatsApp creative"
  | "Product story"
  | "Founder video"
  | "Culture Conversation"
  | "Aarla Pick";

export interface ShopifyOrder {
  id: string;
  customer: string;
  products: { name: string; qty: number }[];
  paymentStatus: OrderPaymentStatus;
  orderDate: string;
  deliveryCity: string;
  packageWeightKg: number;
  courierStatus: CourierStatus;
  total: number;
}

export interface ProjectTask {
  id: string;
  title: string;
  done: boolean;
  due?: string;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  deadline: string;
  budget: number;
  capitalCommitted: number;
  linkedProducts: string[];
  vendors: string[];
  tasks: ProjectTask[];
  manufacturingOrders: string[];
  contentTasks: string[];
  risks: string[];
  notes: string;
  world?: string;
}

export interface ContentTask {
  id: string;
  title: string;
  product?: string;
  world?: string;
  platform: string;
  format: ContentFormat;
  dueDate: string;
  status: ContentStatus;
  captionDraft: string;
  assets: { label: string; done: boolean }[];
}

export interface PriorityItem {
  id: string;
  title: string;
  source: string;
  urgency: "High" | "Medium" | "Low";
  href: string;
}

export interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  tone: import("./domain/types").StatusTone;
  href: string;
}

export interface DashboardMetrics {
  revenue: number;
  revenueChange: number;
  orders: number;
  ordersChange: number;
  aov: number;
  grossMargin: number;
  capitalBlocked: number;
  outstandingReceivables: number;
}

export interface LaunchChecklist {
  id: string;
  productName: string;
  category: string;
  world: string;
  story: string;
  description: string;
  sellingPrice: number;
  cost: number;
  inventory: number;
  photosReady: boolean;
  barcodeReady: boolean;
  shopifyReady: boolean;
  contentReady: boolean;
  launchDate: string;
  blockers: string[];
}

export interface HamperOption {
  id: string;
  name: string;
  products: string[];
  packaging: string;
  cost: number;
  sellingPrice: number;
  margin: number;
  existingInventory: string[];
  toManufacture: string[];
  leadTimeDays: number;
}

export interface IdeaExploration {
  worlds: string[];
  stories: string[];
  objects: string[];
  experiences: string[];
  customerSegments: string[];
  existingProducts: string[];
  productOpportunities: {
    id: string;
    name: string;
    rationale: string;
    moq: number;
    unitCost: number;
    estimatedCapital: number;
    vendor: string;
  }[];
  relevantVendors: string[];
}
