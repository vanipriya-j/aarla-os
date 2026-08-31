/**
 * @deprecated Seed-source only — imported by `scripts/seed-db.ts`.
 * Application screens must not read this module at runtime.
 * Business state lives in local PostgreSQL via Application Services.
 */
import { products } from "./domain/catalog";
import type {
  AttentionItem,
  ContentTask,
  DashboardMetrics,
  IdeaExploration,
  LaunchChecklist,
  PriorityItem,
  Project,
  ShopifyOrder,
} from "./types";

export { products, vendors, purchaseOrdersSeed as purchaseOrders } from "./domain/catalog";
export type { Product, Vendor, PurchaseOrder } from "./domain/types";

export const shopifyOrders: ShopifyOrder[] = [
  {
    id: "ORD-8841",
    customer: "Priya Raman",
    products: [
      { name: "Muruga Water Bottle — 750ml", qty: 2 },
      { name: "Ganapathi Fridge Magnet Set", qty: 1 },
    ],
    paymentStatus: "Paid",
    orderDate: "2026-07-21",
    deliveryCity: "Bengaluru",
    packageWeightKg: 1.2,
    courierStatus: "Awaiting Pack",
    total: 2130,
  },
  {
    id: "ORD-8837",
    customer: "Ananya Krishnan",
    products: [{ name: "Lakshmi Brass Davara Tumbler", qty: 1 }],
    paymentStatus: "Paid",
    orderDate: "2026-07-21",
    deliveryCity: "Chennai",
    packageWeightKg: 0.8,
    courierStatus: "Awaiting Pack",
    total: 1450,
  },
  {
    id: "ORD-8832",
    customer: "Rahul Menon",
    products: [
      { name: "Chennai Market Tote", qty: 1 },
      { name: "Amman Stories — Children's Book", qty: 2 },
    ],
    paymentStatus: "COD",
    orderDate: "2026-07-20",
    deliveryCity: "Kochi",
    packageWeightKg: 1.5,
    courierStatus: "Packed",
    total: 1778,
  },
  {
    id: "ORD-8825",
    customer: "Meera Subramanian",
    products: [{ name: "Kolam Framed Art — 12x16", qty: 1 }],
    paymentStatus: "Paid",
    orderDate: "2026-07-19",
    deliveryCity: "Hyderabad",
    packageWeightKg: 2.1,
    courierStatus: "Pickup Scheduled",
    total: 2200,
  },
  {
    id: "ORD-8818",
    customer: "Kumon Learning Centre",
    products: [
      { name: "Chennai Market Tote", qty: 10 },
      { name: "Ganapathi Fridge Magnet Set", qty: 20 },
    ],
    paymentStatus: "Pending",
    orderDate: "2026-07-18",
    deliveryCity: "Chennai",
    packageWeightKg: 8.4,
    courierStatus: "Awaiting Pack",
    total: 14800,
  },
];

export const projects: Project[] = [
  {
    id: "prj-1",
    name: "Muruga World Launch",
    status: "Manufacturing",
    deadline: "2026-09-01",
    budget: 350000,
    capitalCommitted: 214000,
    linkedProducts: ["Muruga Water Bottle — 750ml", "Muruga Magnet Set", "Muruga Story Card"],
    vendors: ["Sri Velan Bottles", "Pondy Print House"],
    tasks: [
      { id: "t1", title: "Approve bottle artwork v3", done: true },
      { id: "t2", title: "Confirm magnet colourways", done: false, due: "2026-07-25" },
      { id: "t3", title: "Draft launch email", done: false, due: "2026-08-15" },
      { id: "t4", title: "Shoot product photography", done: false, due: "2026-08-10" },
    ],
    manufacturingOrders: ["PO-2401"],
    contentTasks: ["ct-1", "ct-4"],
    risks: ["Bottle print colour may shift on navy body", "Photography slot not booked"],
    notes: "Lead world for Navarathri season. Pair bottles with magnets for gift sets.",
    world: "Muruga",
  },
  {
    id: "prj-2",
    name: "Kumon Chennai Hampers",
    status: "In Progress",
    deadline: "2026-08-05",
    budget: 185000,
    capitalCommitted: 92000,
    linkedProducts: ["Chennai Market Tote", "Ganapathi Fridge Magnet Set", "Amman Stories — Children's Book"],
    vendors: ["Kanchi Weave Studio"],
    tasks: [
      { id: "t5", title: "Finalise hamper SKU mix", done: true },
      { id: "t6", title: "Print thank-you cards", done: false, due: "2026-07-28" },
      { id: "t7", title: "Schedule dispatch window", done: false, due: "2026-08-02" },
    ],
    manufacturingOrders: [],
    contentTasks: ["ct-3"],
    risks: ["Institutional invoice pending"],
    notes: "100 hampers for teacher appreciation. Client wants Chennai + learning motif.",
    world: "Chennai",
  },
  {
    id: "prj-3",
    name: "Chalanam 2026 Merchandise",
    status: "Planning",
    deadline: "2026-11-15",
    budget: 420000,
    capitalCommitted: 45000,
    linkedProducts: ["Bharatanatyam Gesture Pouch", "Event Tote — Chalanam"],
    vendors: ["Kanchi Weave Studio", "Pondy Print House"],
    tasks: [
      { id: "t8", title: "Collect motif references from organisers", done: true },
      { id: "t9", title: "Propose 3 merch tiers", done: false, due: "2026-07-30" },
    ],
    manufacturingOrders: [],
    contentTasks: [],
    risks: ["Organiser logo guidelines not received"],
    notes: "Dance festival merch. Emphasise mudras and rhythm without costume clichés.",
    world: "Bharatanatyam",
  },
  {
    id: "prj-4",
    name: "Varalakshmi Collection",
    status: "Ideation",
    deadline: "2026-08-20",
    budget: 275000,
    capitalCommitted: 0,
    linkedProducts: ["Lakshmi Brass Davara Tumbler"],
    vendors: ["Moradabad Brass Collective"],
    tasks: [
      { id: "t10", title: "Moodboard for Varalakshmi morning rituals", done: false, due: "2026-07-26" },
      { id: "t11", title: "Price brass line for festival drop", done: false },
    ],
    manufacturingOrders: [],
    contentTasks: ["ct-2"],
    risks: ["Short window before festival"],
    notes: "Extend Lakshmi world into a focused festival capsule.",
    world: "Lakshmi",
  },
  {
    id: "prj-5",
    name: "Moradabad Sourcing Trip",
    status: "In Progress",
    deadline: "2026-08-12",
    budget: 85000,
    capitalCommitted: 32000,
    linkedProducts: ["Lakshmi Brass Davara Tumbler", "Carnatic Raga Tray"],
    vendors: ["Moradabad Brass Collective"],
    tasks: [
      { id: "t12", title: "Book travel & stay", done: true },
      { id: "t13", title: "Prepare vendor visit checklist", done: false, due: "2026-07-27" },
      { id: "t14", title: "Sample finish comparisons", done: false, due: "2026-08-08" },
    ],
    manufacturingOrders: ["PO-2398"],
    contentTasks: [],
    risks: ["Monsoon travel delays"],
    notes: "Focus on finish consistency and MOQ flexibility for trays.",
    world: "Lakshmi",
  },
];

export const contentTasks: ContentTask[] = [
  {
    id: "ct-1",
    title: "Muruga bottle — shelf story reel",
    product: "Muruga Water Bottle — 750ml",
    world: "Muruga",
    platform: "Instagram",
    format: "Reel",
    dueDate: "2026-07-28",
    status: "In Production",
    captionDraft:
      "A bottle that carries a story. Muruga — for the desk, the studio, the temple steps.",
    assets: [
      { label: "Product hero clip", done: true },
      { label: "Caption draft", done: true },
      { label: "Cover frame", done: false },
      { label: "Music clearance", done: false },
    ],
  },
  {
    id: "ct-2",
    title: "Varalakshmi morning LinkedIn note",
    product: "Lakshmi Brass Davara Tumbler",
    world: "Lakshmi",
    platform: "LinkedIn",
    format: "LinkedIn post",
    dueDate: "2026-08-01",
    status: "Draft",
    captionDraft:
      "Founders often ask how culture becomes product. For us, it starts with a morning object.",
    assets: [
      { label: "Photo set", done: false },
      { label: "Caption draft", done: true },
      { label: "CTA link", done: false },
    ],
  },
  {
    id: "ct-3",
    title: "Kumon hamper WhatsApp creative",
    product: "Chennai Market Tote",
    world: "Chennai",
    platform: "WhatsApp",
    format: "WhatsApp creative",
    dueDate: "2026-07-26",
    status: "Review",
    captionDraft: "A Chennai-rooted thank-you for the teachers who shape young minds.",
    assets: [
      { label: "Square creative", done: true },
      { label: "Hamper flat-lay", done: true },
      { label: "Client approval", done: false },
    ],
  },
  {
    id: "ct-4",
    title: "Culture Conversation — Navarathri objects",
    world: "Navarathri",
    platform: "Instagram",
    format: "Culture Conversation",
    dueDate: "2026-08-08",
    status: "Idea",
    captionDraft: "What objects hold Navarathri for you — beyond the altar?",
    assets: [
      { label: "Interview outline", done: false },
      { label: "Guest confirmed", done: false },
    ],
  },
  {
    id: "ct-5",
    title: "Aarla Pick — Ganapathi magnets",
    product: "Ganapathi Fridge Magnet Set",
    world: "Ganapathi",
    platform: "Pinterest",
    format: "Aarla Pick",
    dueDate: "2026-07-30",
    status: "Scheduled",
    captionDraft: "Small beginnings, pinned to the everyday.",
    assets: [
      { label: "Pin graphic", done: true },
      { label: "Product link", done: true },
    ],
  },
];

export const priorities: PriorityItem[] = [
  {
    id: "pr1",
    title: "Receive PO-2402 magnets from Pondy",
    source: "Receive Stock",
    urgency: "High",
    href: "/receive",
  },
  {
    id: "pr2",
    title: "Fulfil Kumon institutional order",
    source: "Fulfil Orders",
    urgency: "High",
    href: "/fulfil",
  },
  {
    id: "pr3",
    title: "Approve Muruga bottle artwork",
    source: "Manufacture",
    urgency: "Medium",
    href: "/manufacture",
  },
  {
    id: "pr4",
    title: "Finish Kumon WhatsApp creative review",
    source: "Content Studio",
    urgency: "Medium",
    href: "/content",
  },
];

export const attentionItems: AttentionItem[] = [
  {
    id: "a1",
    title: "Partial brass delivery — 8 tumblers missing",
    detail: "PO-2398 from Moradabad Brass Collective",
    tone: "warning",
    href: "/receive",
  },
  {
    id: "a2",
    title: "Kolam framed art at 7 units",
    detail: "Below reorder threshold for Slow movers",
    tone: "danger",
    href: "/manufacture",
  },
  {
    id: "a3",
    title: "ORD-8818 payment still pending",
    detail: "Kumon Learning Centre — ₹14,800",
    tone: "warning",
    href: "/fulfil",
  },
  {
    id: "a4",
    title: "Muruga photography not booked",
    detail: "Blocks launch checklist readiness",
    tone: "info",
    href: "/launch",
  },
];

export const dashboardMetrics: DashboardMetrics = {
  revenue: 684200,
  revenueChange: 12.4,
  orders: 418,
  ordersChange: 8.1,
  aov: 1637,
  grossMargin: 54.2,
  capitalBlocked: 312800,
  outstandingReceivables: 48600,
};

export const revenueByMonth = [
  { month: "Jan", revenue: 42000 },
  { month: "Feb", revenue: 48500 },
  { month: "Mar", revenue: 51200 },
  { month: "Apr", revenue: 57800 },
  { month: "May", revenue: 61000 },
  { month: "Jun", revenue: 68200 },
  { month: "Jul", revenue: 71500 },
];

export const channelMix = [
  { channel: "Shopify D2C", share: 48, revenue: 328400 },
  { channel: "Institutional", share: 22, revenue: 150500 },
  { channel: "Pop-ups", share: 15, revenue: 102600 },
  { channel: "WhatsApp", share: 10, revenue: 68400 },
  { channel: "Wholesale", share: 5, revenue: 34300 },
];

export const sampleAdvice: Record<
  string,
  { answer: string; actions: { label: string; href: string }[] }
> = {
  "What should I manufacture before Navarathri?": {
    answer:
      "Navarathri demand historically concentrates on Amman Stories books, Ganapathi magnets, and Lakshmi ritual objects. Your book stock is healthy; magnets can support a festival push. Brass tumblers are thin — Moradabad lead time is ~28 days, so place a reorder this week if you want them on shelves by early September.",
    actions: [
      { label: "Start Manufacturing", href: "/manufacture" },
      { label: "Create Project", href: "/projects" },
      { label: "Review Inventory", href: "/inventory" },
    ],
  },
  "Can I fulfil a 100-piece hamper order?": {
    answer:
      "Yes, with a Chennai-rooted mix using existing inventory: Market Totes, Ganapathi magnets, and Amman Stories books. Bottleneck is often totes — start a quick reorder with Kanchi Weave or substitute pouches for part of the run.",
    actions: [
      { label: "Build Hamper", href: "/story" },
      { label: "Start Manufacturing", href: "/manufacture" },
      { label: "Add to Priorities", href: "/" },
    ],
  },
  "Which products are blocking the most capital?": {
    answer:
      "Highest binders tend to be framed art and trays (slow velocity, high unit cost), plus brass mid-pipeline. Fast movers — bottles and magnets — turn capital quickly. Review the inventory ledger for current balances.",
    actions: [
      { label: "Review Inventory", href: "/inventory" },
      { label: "Create Project", href: "/projects" },
    ],
  },
  "What should I look for in Moradabad?": {
    answer:
      "For the sourcing trip: finish consistency on davara rims, ability to drop MOQ for trial SKUs, sample patina levels for Lakshmi line, tray weight vs shipping cost, and packaging that survives courier without foam waste.",
    actions: [
      { label: "Open Project", href: "/projects/prj-5" },
      { label: "Start Manufacturing", href: "/manufacture" },
    ],
  },
  "Should I reorder bottles now?": {
    answer:
      "Check studio stock and open POs on the inventory ledger before double-ordering. If PO-2401 is still in production, wait for QC receive before placing another colourway.",
    actions: [
      { label: "Review Inventory", href: "/inventory" },
      { label: "Receive Stock", href: "/receive" },
      { label: "Add to Priorities", href: "/" },
    ],
  },
};

export function exploreIdea(theme: string): IdeaExploration {
  const t = theme.trim() || "Muruga";
  return {
    worlds: [t, `${t} & Everyday Ritual`, `Contemporary ${t}`],
    stories: [
      `${t} as a morning companion`,
      `Passing ${t} stories across generations`,
      `${t} in the city — temple steps to studio desks`,
    ],
    objects: [
      "Water bottle",
      "Fridge magnet set",
      "Pouch",
      "Brass tumbler",
      "Story card pack",
      "Framed art print",
    ],
    experiences: [
      "Desk ritual kit",
      "Festival gifting hamper",
      "Children's story hour bundle",
      "Studio / office welcome set",
    ],
    customerSegments: [
      "Urban diaspora families",
      "Design-conscious professionals",
      "Parents of 4–10 year olds",
      "Institutional gifting buyers",
      "Temple & cultural event organisers",
    ],
    existingProducts: products
      .filter((p) => p.world.toLowerCase().includes(t.toLowerCase()) || t.length < 3)
      .slice(0, 4)
      .map((p) => p.title)
      .concat(
        products
          .filter((p) => !p.world.toLowerCase().includes(t.toLowerCase()))
          .slice(0, 2)
          .map((p) => p.title),
      )
      .slice(0, 4),
    productOpportunities: [
      {
        id: "opp-1",
        name: `${t} Water Bottle — Indigo`,
        rationale: `Extends proven bottle format into a ${t}-led colour story for desks and travel.`,
        moq: 100,
        unitCost: 335,
        estimatedCapital: 33500,
        vendor: "Sri Velan Bottles",
      },
      {
        id: "opp-2",
        name: `${t} Magnet Triptych`,
        rationale: "Low capital, high giftability, strong festival and institutional attach rate.",
        moq: 200,
        unitCost: 92,
        estimatedCapital: 18400,
        vendor: "Pondy Print House",
      },
      {
        id: "opp-3",
        name: `${t} Story Pouch + Card`,
        rationale: "Textile + narrative combo for hampers without heavy inventory risk.",
        moq: 75,
        unitCost: 210,
        estimatedCapital: 15750,
        vendor: "Kanchi Weave Studio",
      },
    ],
    relevantVendors: [
      "Sri Velan Bottles",
      "Pondy Print House",
      "Kanchi Weave Studio",
      "Moradabad Brass Collective",
    ],
  };
}

export const launchChecklists: LaunchChecklist[] = [
  {
    id: "lc-1",
    productName: "Muruga Water Bottle — Indigo",
    category: "Water bottles",
    world: "Muruga",
    story: "A daily vessel for devotion that travels from home altar to office desk.",
    description:
      "750ml dual-wall bottle with Muruga line illustration in warm cream on deep indigo.",
    sellingPrice: 920,
    cost: 335,
    inventory: 0,
    photosReady: false,
    barcodeReady: false,
    shopifyReady: false,
    contentReady: false,
    launchDate: "2026-09-01",
    blockers: ["Awaiting manufacturing delivery", "Photography not booked", "Barcode not generated"],
  },
  {
    id: "lc-2",
    productName: "Navarathri Magnet Assortment",
    category: "Magnets",
    world: "Navarathri",
    story: "Nine forms, nine small joys for the fridge and the festival shelf.",
    description: "Set of 9 illustrated magnets with soft-touch laminate finish.",
    sellingPrice: 480,
    cost: 85,
    inventory: 0,
    photosReady: true,
    barcodeReady: true,
    shopifyReady: false,
    contentReady: true,
    launchDate: "2026-08-25",
    blockers: ["Stock not received", "Shopify listing draft incomplete"],
  },
  {
    id: "lc-3",
    productName: "Bharatanatyam Gesture Pouch — Gold",
    category: "Pouches",
    world: "Bharatanatyam",
    story: "A pocket for the small things that keep rhythm with the day.",
    description: "Canvas pouch with mudra motif in mustard on soft beige.",
    sellingPrice: 560,
    cost: 185,
    inventory: 40,
    photosReady: true,
    barcodeReady: true,
    shopifyReady: true,
    contentReady: false,
    launchDate: "2026-08-12",
    blockers: ["Content captions pending review"],
  },
];

export const recentProjects = projects.slice(0, 4);

export const packagingChecklistDefaults = [
  "Product checked",
  "Bubble wrap added",
  "Thank-you card added",
  "QR card added",
  "Package sealed",
  "Shipping label attached",
];

export const tipPrompts = Object.keys(sampleAdvice);
