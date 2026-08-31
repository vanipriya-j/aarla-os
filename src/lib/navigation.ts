import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  ClipboardList,
  Compass,
  Factory,
  FolderKanban,
  LayoutDashboard,
  CalendarRange,
  Megaphone,
  MessageCircleHeart,
  Package,
  PackageCheck,
  Palette,
  Rocket,
  Phone,
  Activity,
  Receipt,
  ScanLine,
  Store,
  Truck,
  Users,
  BookOpen,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

/**
 * Daily operating loop — pack, call, stock, make, plan the week.
 * (Fulfil href stays /dispatch until the Fulfil Orders PR lands on main.)
 */
export const operateNav: NavItem[] = [
  {
    label: "This Week",
    href: "/weekly",
    icon: CalendarRange,
    description: "Weekly operating board — targets vs actuals.",
  },
  {
    label: "Fulfil Orders",
    href: "/dispatch",
    icon: Truck,
    description: "Stock check, pack, ship and today's handover.",
  },
  {
    label: "Customer Calls",
    href: "/customer-calls",
    icon: Phone,
    description: "Delivery follow-ups and re-engagement calls.",
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    description: "Stock, replenishment, locations and movement ledger.",
  },
  {
    label: "Manufacture / Reorder",
    href: "/manufacture",
    icon: Factory,
    description: "Raise POs and vendor-specific orders.",
  },
  {
    label: "Receive Stock",
    href: "/receive",
    icon: PackageCheck,
    description: "QC incoming stock and ready it for sale.",
  },
  {
    label: "Campaigns",
    href: "/campaigns",
    icon: Megaphone,
    description: "Ops campaign planner — soft inventory holds and readiness.",
  },
];

/** Brand, storytelling and product creation. */
export const createNav: NavItem[] = [
  {
    label: "Need Advice",
    href: "/advice",
    icon: MessageCircleHeart,
    description: "Ask the founder copilot for clear next steps.",
  },
  {
    label: "Explore an Idea",
    href: "/explore",
    icon: Compass,
    description: "Map a thought across the Aarla Universe — worlds, concepts, objects and stories.",
  },
  {
    label: "Your Story. Our Telling.",
    href: "/story",
    icon: BookOpen,
    description: "Design hampers and institutional gifts.",
  },
  {
    label: "Content Studio",
    href: "/content",
    icon: Palette,
    description: "Plan stories across every channel.",
  },
  {
    label: "Projects",
    href: "/projects",
    icon: FolderKanban,
    description: "Track Worlds, trips and client work.",
  },
  {
    label: "Launch Products",
    href: "/launch",
    icon: Rocket,
    description: "Checklist your way to a confident launch.",
  },
];

/**
 * Setup, master data, finance prep, wiring — not the daily packing loop.
 */
export const adminNav: NavItem[] = [
  {
    label: "Business Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Revenue, capital and movement at a glance.",
  },
  {
    label: "GST Reconciliation",
    href: "/finance/gst",
    icon: Receipt,
    description: "Monthly sales & purchase capture for your accountant.",
  },
  {
    label: "People",
    href: "/people",
    icon: Users,
    description: "Customers, users and community members.",
  },
  {
    label: "Partners",
    href: "/partners",
    icon: Store,
    description: "Retail, café and studio partners.",
  },
  {
    label: "Registrations",
    href: "/registrations",
    icon: ClipboardList,
    description: "Product registrations and community.",
  },
  {
    label: "Register Product",
    href: "/register",
    icon: ScanLine,
    description: "Tell us where your Aarla story reached.",
  },
  {
    label: "Diagnostics",
    href: "/diagnostics",
    icon: Activity,
    description: "Health of database, Shopify, and Delhivery wiring.",
  },
];

/** @deprecated Prefer operateNav + createNav. Kept for home tile grids. */
export const primaryTiles: NavItem[] = [...operateNav, ...createNav];

/** @deprecated Prefer adminNav (People/Partners) + operateNav (Inventory). */
export const networkNav: NavItem[] = adminNav.filter((item) =>
  ["/people", "/partners", "/registrations", "/register"].includes(item.href),
);

/** @deprecated Prefer operateNav (calls) + adminNav (diagnostics). */
export const outreachNav: NavItem[] = [
  ...operateNav.filter((item) => item.href === "/customer-calls"),
  ...adminNav.filter((item) => item.href === "/diagnostics"),
];

/** @deprecated Prefer adminNav. */
export const financeNav: NavItem[] = adminNav.filter(
  (item) => item.href === "/finance/gst",
);

export const sidebarNav: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: Boxes,
    description: "Today’s operating view",
  },
  ...operateNav,
  ...createNav,
  ...adminNav,
];
