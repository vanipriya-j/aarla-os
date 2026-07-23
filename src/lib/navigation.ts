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
  MessageCircleHeart,
  Package,
  PackageCheck,
  Palette,
  Rocket,
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
    description: "Turn a theme or motif into product opportunities.",
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
    label: "Dispatch Orders",
    href: "/dispatch",
    icon: Truck,
    description: "Pack, label and send channel orders.",
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
    label: "Business Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Revenue, capital and movement at a glance.",
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
    description: "Stock, batches and movement ledger.",
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

export const sidebarNav: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: Boxes,
    description: "Today’s operating view",
  },
  ...primaryTiles,
  ...networkNav,
  {
    label: "Checklists",
    href: "/launch",
    icon: ClipboardCheck,
    description: "Launch readiness",
  },
];
