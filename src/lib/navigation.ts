import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Boxes,
  ClipboardCheck,
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
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

export const primaryTiles: NavItem[] = [
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
    label: "Fulfil Orders",
    href: "/fulfil",
    icon: Truck,
    description: "Stock check, pack, ship and today's handover.",
  },
  {
    label: "Launch Products",
    href: "/launch",
    icon: Rocket,
    description: "Checklist your way to a confident launch.",
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
    label: "This Week",
    href: "/weekly",
    icon: CalendarRange,
    description: "Weekly operating board — targets vs actuals.",
  },
  {
    label: "Campaigns",
    href: "/campaigns",
    icon: Megaphone,
    description: "Ops campaign planner — soft inventory holds and readiness.",
  },
  {
    label: "Business Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Revenue, capital and movement at a glance.",
  },
];

/** Finance — GST preparation only (not a general accounting module). */
export const financeNav: NavItem[] = [
  {
    label: "GST Reconciliation",
    href: "/finance/gst",
    icon: Receipt,
    description: "Monthly sales & purchase capture for your accountant.",
  },
];

export const networkNav: NavItem[] = [
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
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    description: "Stock, replenishment, locations and movement ledger.",
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
];

/** Outreach links — rendered near the bottom of the sidebar. */
export const outreachNav: NavItem[] = [
  {
    label: "Customer Calls",
    href: "/customer-calls",
    icon: Phone,
    description: "Delivery follow-ups and re-engagement calls.",
  },
  {
    label: "Diagnostics",
    href: "/diagnostics",
    icon: Activity,
    description: "Health of database, Shopify, and Delhivery wiring.",
  },
];

export const sidebarNav: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: Boxes,
    description: "Today’s operating view",
  },
  ...primaryTiles,
  ...financeNav,
  ...networkNav,
  ...outreachNav,
  {
    label: "Checklists",
    href: "/launch",
    icon: ClipboardCheck,
    description: "Launch readiness",
  },
];
