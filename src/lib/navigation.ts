import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Boxes,
  ClipboardCheck,
  Compass,
  Factory,
  FolderKanban,
  LayoutDashboard,
  MessageCircleHeart,
  PackageCheck,
  Palette,
  Rocket,
  Truck,
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
    description: "Pack, label and send Shopify orders.",
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

export const sidebarNav: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: Boxes,
    description: "Today’s operating view",
  },
  ...primaryTiles,
  {
    label: "Checklists",
    href: "/launch",
    icon: ClipboardCheck,
    description: "Launch readiness",
  },
];
