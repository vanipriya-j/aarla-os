import type {
  Location,
  ManufacturingBatch,
  Organization,
  Partner,
  Person,
  Product,
  ProductRegistration,
  PurchaseOrder,
  Vendor,
} from "./types";

/** Stable location IDs — ledger references these. */
export const LOC = {
  external: "loc-external",
  studio: "loc-studio",
  freshly: "loc-partner-freshly",
  nimalli: "loc-partner-nimalli",
  ngs: "loc-partner-ngs",
  /**
   * D2C / web channel stock pool (currently labelled Shopify in the UI).
   * This is an Aarla OS location — not a Shopify inventory mirror.
   * Channel adapters may sync fulfilment against SalesOrders; they do not own balances here.
   */
  shopify: "loc-shopify",
  damage: "loc-damage",
  sold: "loc-sold",
  infosys: "loc-corporate-infosys",
} as const;

export const locations: Location[] = [
  { id: LOC.external, name: "Vendor (inbound)", kind: "External" },
  { id: LOC.studio, name: "Aarla Studio", kind: "Studio" },
  { id: LOC.freshly, name: "Freshly Brewed", kind: "Partner", partnerId: "partner-freshly" },
  { id: LOC.nimalli, name: "Nimalli", kind: "Partner", partnerId: "partner-nimalli" },
  { id: LOC.ngs, name: "NGS", kind: "Partner", partnerId: "partner-ngs" },
  {
    id: LOC.shopify,
    name: "D2C Channel Pool",
    kind: "Channel",
  },
  { id: LOC.damage, name: "Damaged Hold", kind: "Hold" },
  { id: LOC.sold, name: "Sold / In Circulation", kind: "Channel" },
  { id: LOC.infosys, name: "Infosys (Corporate)", kind: "Channel" },
];

/** Single product catalog. */
export const products: Product[] = [
  {
    id: "prod-kolam-bottle",
    sku: "AAR-BOT-KOL-750",
    title: "Kolam Bottle",
    category: "Water bottles",
    world: "Chennai",
    story: "A daily vessel carrying the quiet geometry of a Chennai morning kolam.",
    variants: [
      { id: "var-kol-cream", label: "Warm cream on indigo", sku: "AAR-BOT-KOL-750-IND" },
      { id: "var-kol-mustard", label: "Mustard line on navy", sku: "AAR-BOT-KOL-750-NAV" },
    ],
    sellingPrice: 920,
    cost: 335,
    velocity: "Fast",
    status: "Active",
    ideaOrigin: "Explore an Idea — Chennai morning rituals",
    designedDate: "2026-06-12",
  },
  {
    id: "prod-muruga-bottle",
    sku: "AAR-BOT-MUR-750",
    title: "Muruga Water Bottle — 750ml",
    category: "Water bottles",
    world: "Muruga",
    story: "A bottle that carries Muruga from desk to temple steps.",
    variants: [
      { id: "var-mur-750", label: "750ml cream on navy", sku: "AAR-BOT-MUR-750" },
    ],
    sellingPrice: 890,
    cost: 320,
    velocity: "Fast",
    status: "Active",
    ideaOrigin: "Muruga World Launch",
    designedDate: "2026-05-01",
  },
  {
    id: "prod-lakshmi-tumbler",
    sku: "AAR-BRS-LAK-01",
    title: "Lakshmi Brass Davara Tumbler",
    category: "Brass davara tumblers",
    world: "Lakshmi",
    story: "A morning ritual object for the Lakshmi world.",
    variants: [{ id: "var-lak-01", label: "Standard finish", sku: "AAR-BRS-LAK-01" }],
    sellingPrice: 1450,
    cost: 680,
    velocity: "Steady",
    status: "Active",
  },
  {
    id: "prod-ganapathi-magnets",
    sku: "AAR-MAG-GAN-04",
    title: "Ganapathi Fridge Magnet Set",
    category: "Magnets",
    world: "Ganapathi",
    story: "Small beginnings, pinned to the everyday.",
    variants: [{ id: "var-gan-04", label: "Set of 4", sku: "AAR-MAG-GAN-04" }],
    sellingPrice: 350,
    cost: 95,
    velocity: "Fast",
    status: "Active",
  },
  {
    id: "prod-chennai-tote",
    sku: "AAR-TOT-CHN-01",
    title: "Chennai Market Tote",
    category: "Tote bags",
    world: "Chennai",
    story: "A market bag for the everyday Chennai errand.",
    variants: [{ id: "var-tot-std", label: "Natural canvas", sku: "AAR-TOT-CHN-01" }],
    sellingPrice: 780,
    cost: 290,
    velocity: "Steady",
    status: "Active",
    ideaOrigin: "Chennai World",
    designedDate: "2026-04-08",
  },
  {
    id: "prod-carnatic-tray",
    sku: "AAR-TRY-CAR-02",
    title: "Carnatic Raga Tray",
    category: "Trays",
    world: "Carnatic music",
    story: "A tray that holds the quiet of a raga practice.",
    variants: [{ id: "var-try-02", label: "Standard", sku: "AAR-TRY-CAR-02" }],
    sellingPrice: 1680,
    cost: 720,
    velocity: "Slow",
    status: "Low stock",
  },
  {
    id: "prod-bharatanatyam-pouch",
    sku: "AAR-POU-BHA-01",
    title: "Bharatanatyam Gesture Pouch",
    category: "Pouches",
    world: "Bharatanatyam",
    story: "A pocket for the small things that keep rhythm with the day.",
    variants: [{ id: "var-pou-01", label: "Canvas mustard", sku: "AAR-POU-BHA-01" }],
    sellingPrice: 520,
    cost: 180,
    velocity: "Steady",
    status: "Active",
  },
  {
    id: "prod-amman-book",
    sku: "AAR-BOK-AMM-01",
    title: "Amman Stories — Children's Book",
    category: "Children's books",
    world: "Navarathri",
    story: "Festival stories for young readers.",
    variants: [{ id: "var-amm-01", label: "Standard edition", sku: "AAR-BOK-AMM-01" }],
    sellingPrice: 499,
    cost: 165,
    velocity: "Fast",
    status: "Active",
  },
  {
    id: "prod-muruga-book",
    sku: "AAR-BOK-MUR-01",
    title: "Muruga Book",
    category: "Children's books",
    world: "Muruga",
    story: "A gentle telling of Muruga for young readers and gift-giving desks.",
    variants: [{ id: "var-mb-std", label: "Standard edition", sku: "AAR-BOK-MUR-01" }],
    sellingPrice: 499,
    cost: 165,
    velocity: "Fast",
    status: "Active",
    ideaOrigin: "Muruga World Launch",
    designedDate: "2026-05-20",
  },
  {
    id: "prod-kolam-art",
    sku: "AAR-ART-KOL-12",
    title: "Kolam Framed Art — 12x16",
    category: "Framed art",
    world: "Chennai",
    story: "Framed kolam geometry for the wall.",
    variants: [{ id: "var-art-12", label: "12x16 frame", sku: "AAR-ART-KOL-12" }],
    sellingPrice: 2200,
    cost: 890,
    velocity: "Slow",
    status: "Low stock",
  },
  {
    id: "prod-welcome-kit",
    sku: "AAR-KIT-WEL-01",
    title: "Welcome Kit",
    category: "Hampers",
    world: "Chennai",
    story: "A rooted welcome set for new joiners — tote, magnet, story card.",
    variants: [{ id: "var-wk-std", label: "Standard kit", sku: "AAR-KIT-WEL-01" }],
    sellingPrice: 1450,
    cost: 720,
    velocity: "Steady",
    status: "Allocated",
    ideaOrigin: "Your Story. Our Telling. — corporate welcome",
    designedDate: "2026-06-01",
  },
];

/** Single vendor model. */
export const vendors: Vendor[] = [
  {
    id: "vendor-sizzle",
    name: "Sizzle Bottles",
    city: "Chennai",
    category: "Printed steel bottles",
    contact: "orders@sizzlebottles.example",
    moq: 100,
    leadTimeDays: 18,
    qualityRating: 4.7,
  },
  {
    id: "vendor-velan",
    name: "Sri Velan Bottles",
    city: "Chennai",
    category: "Printed steel & BPA-free bottles",
    contact: "orders@srivelan.example",
    moq: 100,
    leadTimeDays: 18,
    qualityRating: 4.6,
  },
  {
    id: "vendor-pondy",
    name: "Pondy Print House",
    city: "Puducherry",
    category: "Magnets, stickers, small print runs",
    contact: "hello@pondyprint.example",
    moq: 200,
    leadTimeDays: 12,
    qualityRating: 4.4,
  },
  {
    id: "vendor-moradabad",
    name: "Moradabad Brass Collective",
    city: "Moradabad",
    category: "Brass tumblers, trays, ritual objects",
    contact: "studio@mbc.example",
    moq: 50,
    leadTimeDays: 28,
    qualityRating: 4.8,
  },
  {
    id: "vendor-kanchi",
    name: "Kanchi Weave Studio",
    city: "Kanchipuram",
    category: "Totes, pouches, textile gifts",
    contact: "weave@kanchi.example",
    moq: 75,
    leadTimeDays: 21,
    qualityRating: 4.7,
  },
  {
    id: "vendor-madurai",
    name: "Madurai Frame Works",
    city: "Madurai",
    category: "Framed art, print finishing",
    contact: "frames@madurai.example",
    moq: 25,
    leadTimeDays: 14,
    qualityRating: 4.5,
  },
];

export const batches: ManufacturingBatch[] = [
  {
    id: "batch-kb-2026-07-01",
    batchNumber: "KB-2026-07-01",
    productId: "prod-kolam-bottle",
    vendorId: "vendor-sizzle",
    manufactureDate: "2026-07-01",
    receivedDate: "2026-07-12",
    quantityProduced: 50,
    accepted: 47,
    damaged: 3,
    notes: "Print registration strong. Three units with rim dent — held as damaged.",
  },
  {
    id: "batch-mb-2026-06-15",
    batchNumber: "MB-2026-06-15",
    productId: "prod-muruga-book",
    vendorId: "vendor-pondy",
    manufactureDate: "2026-06-15",
    receivedDate: "2026-06-22",
    quantityProduced: 200,
    accepted: 198,
    damaged: 2,
    notes: "Cover laminate excellent.",
  },
  {
    id: "batch-wk-2026-07-05",
    batchNumber: "WK-2026-07-05",
    productId: "prod-welcome-kit",
    vendorId: "vendor-pondy",
    manufactureDate: "2026-07-05",
    receivedDate: "2026-07-10",
    quantityProduced: 500,
    accepted: 500,
    damaged: 0,
    notes: "Corporate allocation for Infosys welcome kits.",
  },
  {
    id: "batch-mur-bot-2401",
    batchNumber: "MUR-BOT-2026-07",
    productId: "prod-muruga-bottle",
    vendorId: "vendor-velan",
    manufactureDate: "2026-07-01",
    receivedDate: "",
    quantityProduced: 200,
    accepted: 0,
    damaged: 0,
    notes: "In production — awaiting receive.",
  },
];

export const purchaseOrdersSeed: PurchaseOrder[] = [
  {
    id: "PO-KB-2401",
    vendorId: "vendor-sizzle",
    productId: "prod-kolam-bottle",
    quantityOrdered: 50,
    quantityReceived: 47,
    unitCost: 335,
    status: "Received",
    requiredDate: "2026-07-12",
    orderedDate: "2026-06-20",
    batchId: "batch-kb-2026-07-01",
  },
  {
    id: "PO-2401",
    vendorId: "vendor-velan",
    productId: "prod-muruga-bottle",
    quantityOrdered: 200,
    quantityReceived: 0,
    unitCost: 320,
    status: "In Production",
    requiredDate: "2026-08-10",
    orderedDate: "2026-07-01",
    batchId: "batch-mur-bot-2401",
  },
  {
    id: "PO-2402",
    vendorId: "vendor-pondy",
    productId: "prod-ganapathi-magnets",
    quantityOrdered: 500,
    quantityReceived: 0,
    unitCost: 85,
    status: "Shipped",
    requiredDate: "2026-07-28",
    orderedDate: "2026-07-05",
  },
  {
    id: "PO-2398",
    vendorId: "vendor-moradabad",
    productId: "prod-lakshmi-tumbler",
    quantityOrdered: 80,
    quantityReceived: 72,
    unitCost: 680,
    status: "Partial",
    requiredDate: "2026-07-15",
    orderedDate: "2026-06-10",
  },
  {
    id: "PO-2395",
    vendorId: "vendor-kanchi",
    productId: "prod-chennai-tote",
    quantityOrdered: 150,
    quantityReceived: 0,
    unitCost: 290,
    status: "Sent",
    requiredDate: "2026-08-20",
    orderedDate: "2026-07-12",
  },
  {
    id: "PO-WK-2405",
    vendorId: "vendor-pondy",
    productId: "prod-welcome-kit",
    quantityOrdered: 500,
    quantityReceived: 500,
    unitCost: 720,
    status: "Received",
    requiredDate: "2026-07-10",
    orderedDate: "2026-06-25",
    batchId: "batch-wk-2026-07-05",
  },
];

export const partners: Partner[] = [
  {
    id: "partner-freshly",
    name: "Freshly Brewed",
    partnerType: "Café",
    location: "Alwarpet, Chennai",
    contact: "hello@freshlybrewed.example",
    paymentStatus: "Current",
    margin: 28,
    replenishmentHistory: [
      { date: "2026-07-13", productId: "prod-kolam-bottle", quantity: 8, note: "Initial transfer from studio" },
      { date: "2026-07-15", productId: "prod-muruga-book", quantity: 12, note: "Shelf story display" },
    ],
    merchandisingNotes: "Bottles on counter near pastry case. Books on quiet table.",
    displayPhotos: ["Counter vignette", "Shelf story"],
    productsSold: 14,
  },
  {
    id: "partner-nimalli",
    name: "Nimalli",
    partnerType: "Retail Partner",
    location: "Besant Nagar, Chennai",
    contact: "studio@nimalli.example",
    paymentStatus: "Pending",
    margin: 32,
    replenishmentHistory: [
      { date: "2026-07-13", productId: "prod-kolam-bottle", quantity: 10, note: "Window display set" },
    ],
    merchandisingNotes: "Kolam bottles facing street window. Needs photo update.",
    displayPhotos: ["Window display"],
    productsSold: 7,
  },
  {
    id: "partner-ngs",
    name: "NGS",
    partnerType: "Distributor",
    location: "Teynampet, Chennai",
    contact: "buy@ngs.example",
    paymentStatus: "Current",
    margin: 22,
    replenishmentHistory: [
      { date: "2026-06-25", productId: "prod-muruga-book", quantity: 25, note: "Opening stock" },
    ],
    merchandisingNotes: "Books in children's culture section.",
    displayPhotos: [],
    productsSold: 5,
  },
];

export const organizations: Organization[] = [
  {
    id: "org-infosys",
    name: "Infosys",
    type: "Corporate",
    contact: "workplace@infosys.example",
    orders: ["ORD-INFO-500"],
    usersReached: 18,
    city: "Bengaluru",
  },
  {
    id: "org-kumon",
    name: "Kumon Learning Centre",
    type: "School",
    contact: "chennai@kumon.example",
    orders: ["ORD-8818"],
    usersReached: 0,
    city: "Chennai",
  },
];

export const peopleSeed: Person[] = [
  {
    id: "person-vanipriya",
    name: "Vanipriya",
    email: "vanipriya@example.com",
    phone: "+91 98000 11001",
    city: "Chennai",
    roles: ["Customer", "User", "Community Member"],
    interests: ["Chennai", "Home & Living", "Festivals"],
    purchasedOrders: ["ORD-KOL-01"],
    ownedProducts: ["prod-kolam-bottle"],
    registeredProducts: ["prod-kolam-bottle"],
    createdAt: "2026-07-14",
    timeline: [
      { date: "2026-07-14", label: "Purchased Kolam Bottle via Shopify", href: "/products/prod-kolam-bottle" },
      { date: "2026-07-16", label: "Registered Kolam Bottle", href: "/registrations" },
      { date: "2026-07-16", label: "Joined Aarla Community" },
    ],
  },
  {
    id: "person-raghavan",
    name: "Raghavan",
    email: "raghavan@example.com",
    phone: "+91 98000 22002",
    city: "Bengaluru",
    roles: ["Customer"],
    interests: ["Temple Arts", "Children's Books"],
    purchasedOrders: ["ORD-MB-01"],
    ownedProducts: [],
    registeredProducts: [],
    createdAt: "2026-07-10",
    timeline: [
      { date: "2026-07-10", label: "Purchased Muruga Book as gift", href: "/products/prod-muruga-book" },
    ],
  },
  {
    id: "person-ananya",
    name: "Ananya",
    email: "ananya@example.com",
    phone: "+91 98000 33003",
    city: "Bengaluru",
    roles: ["User", "Community Member"],
    interests: ["Children's Books", "Festivals", "Temple Arts"],
    purchasedOrders: [],
    ownedProducts: ["prod-muruga-book"],
    registeredProducts: ["prod-muruga-book"],
    createdAt: "2026-07-18",
    timeline: [
      { date: "2026-07-12", label: "Received Muruga Book as gift" },
      { date: "2026-07-18", label: "Registered Muruga Book", href: "/registrations" },
    ],
  },
  {
    id: "person-meera",
    name: "Meera Subramanian",
    email: "meera@example.com",
    phone: "+91 98000 44004",
    city: "Hyderabad",
    roles: ["Customer", "User"],
    interests: ["Home & Living", "Carnatic Music"],
    purchasedOrders: ["ORD-8825"],
    ownedProducts: ["prod-chennai-tote"],
    registeredProducts: [],
    createdAt: "2026-07-19",
    timeline: [
      { date: "2026-07-19", label: "Purchased Chennai Market Tote", href: "/products/prod-chennai-tote" },
    ],
  },
  {
    id: "person-arjun",
    name: "Arjun Iyer",
    email: "arjun.iyer@infosys.example",
    phone: "+91 98000 55005",
    city: "Mysuru",
    roles: ["User", "Community Member"],
    interests: ["Chennai", "Home & Living"],
    purchasedOrders: [],
    ownedProducts: ["prod-welcome-kit"],
    registeredProducts: ["prod-welcome-kit"],
    createdAt: "2026-07-20",
    timeline: [
      { date: "2026-07-15", label: "Received Infosys Welcome Kit" },
      { date: "2026-07-20", label: "Registered Welcome Kit", href: "/registrations" },
    ],
  },
];

export const registrationsSeed: ProductRegistration[] = [
  {
    registrationId: "reg-001",
    productId: "prod-kolam-bottle",
    batchId: "batch-kb-2026-07-01",
    customerId: "person-vanipriya",
    userId: "person-vanipriya",
    purchaseSource: "Website",
    registrationDate: "2026-07-16",
    registrationCode: "AARLA-KOL-7F2C",
    status: "Community",
  },
  {
    registrationId: "reg-002",
    productId: "prod-muruga-book",
    batchId: "batch-mb-2026-06-15",
    customerId: "person-raghavan",
    userId: "person-ananya",
    purchaseSource: "Gift",
    registrationDate: "2026-07-18",
    registrationCode: "AARLA-MUR-9K1A",
    status: "Community",
  },
  {
    registrationId: "reg-003",
    productId: "prod-welcome-kit",
    batchId: "batch-wk-2026-07-05",
    organizationId: "org-infosys",
    userId: "person-arjun",
    purchaseSource: "Corporate Gift",
    registrationDate: "2026-07-20",
    registrationCode: "AARLA-WEL-3D8P",
    status: "Community",
  },
  {
    registrationId: "reg-004",
    productId: "prod-kolam-bottle",
    batchId: "batch-kb-2026-07-01",
    userId: "person-meera",
    partnerId: "partner-freshly",
    purchaseSource: "Retail Partner",
    registrationDate: "2026-07-17",
    registrationCode: "AARLA-KOL-2M4Q",
    status: "Registered",
  },
  {
    registrationId: "reg-005",
    productId: "prod-kolam-bottle",
    batchId: "batch-kb-2026-07-01",
    userId: "person-arjun",
    partnerId: "partner-nimalli",
    purchaseSource: "Retail Partner",
    registrationDate: "2026-07-21",
    registrationCode: "AARLA-KOL-8H5R",
    status: "Registered",
  },
];

export function getProduct(id: string) {
  return products.find((p) => p.id === id);
}

export function getProductTitle(id: string) {
  return getProduct(id)?.title ?? id;
}

export function getVendor(id: string) {
  return vendors.find((v) => v.id === id);
}

export function getVendorName(id: string) {
  return getVendor(id)?.name ?? id;
}

export function getLocation(id: string) {
  return locations.find((l) => l.id === id);
}

export function getLocationName(id: string) {
  return getLocation(id)?.name ?? id;
}

export function getPartner(id: string) {
  return partners.find((p) => p.id === id);
}

export function getPartnerName(id: string) {
  return getPartner(id)?.name ?? id;
}

export function getPersonName(id: string) {
  return peopleSeed.find((p) => p.id === id)?.name ?? id;
}

export function getBatch(id: string) {
  return batches.find((b) => b.id === id);
}

export function partnerLocationId(partnerId: string) {
  return locations.find((l) => l.partnerId === partnerId)?.id;
}
