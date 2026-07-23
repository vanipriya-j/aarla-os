import type {
  InventoryLocation,
  InventorySnapshot,
  JourneyStage,
  ManufacturingBatch,
  NetworkProduct,
  NetworkVendor,
  Organization,
  Partner,
  Person,
  ProductRegistration,
  StockMovement,
} from "./domain-types";

export const networkVendors: NetworkVendor[] = [
  {
    id: "nv-sizzle",
    company: "Sizzle Bottles",
    contact: "orders@sizzlebottles.example",
    category: "Printed steel bottles",
    leadTime: 18,
    purchaseOrders: ["PO-KB-2401"],
    qualityRating: 4.7,
    city: "Chennai",
  },
  {
    id: "nv-pondy",
    company: "Pondy Print House",
    contact: "hello@pondyprint.example",
    category: "Magnets & print",
    leadTime: 12,
    purchaseOrders: ["PO-2402"],
    qualityRating: 4.4,
    city: "Puducherry",
  },
  {
    id: "nv-moradabad",
    company: "Moradabad Brass Collective",
    contact: "studio@mbc.example",
    category: "Brassware",
    leadTime: 28,
    purchaseOrders: ["PO-2398"],
    qualityRating: 4.8,
    city: "Moradabad",
  },
];

export const locations: InventoryLocation[] = [
  { id: "loc-studio", name: "Aarla Studio", kind: "Studio" },
  { id: "loc-freshly", name: "Freshly Brewed", kind: "Partner", partnerId: "pt-freshly" },
  { id: "loc-nimalli", name: "Nimalli", kind: "Partner", partnerId: "pt-nimalli" },
  { id: "loc-ngs", name: "NGS", kind: "Partner", partnerId: "pt-ngs" },
  { id: "loc-shopify", name: "Shopify", kind: "Channel" },
  { id: "loc-infosys", name: "Infosys (Corporate)", kind: "Corporate" },
  { id: "loc-customer", name: "Customer / User", kind: "Channel" },
  { id: "loc-damage", name: "Damaged Hold", kind: "Studio" },
  { id: "loc-vendor", name: "Vendor (inbound)", kind: "Channel" },
];

export const networkProducts: NetworkProduct[] = [
  {
    id: "np-kolam",
    sku: "AAR-BOT-KOL-750",
    title: "Kolam Bottle",
    category: "Water bottles",
    world: "Chennai",
    story: "A daily vessel carrying the quiet geometry of a Chennai morning kolam.",
    variants: [
      { id: "var-kol-cream", label: "Warm cream on indigo", sku: "AAR-BOT-KOL-750-IND" },
      { id: "var-kol-mustard", label: "Mustard line on navy", sku: "AAR-BOT-KOL-750-NAV" },
    ],
    currentInventory: 17,
    registrations: 3,
    currentLifecycleStatus: "In Circulation",
    sellingPrice: 920,
    cost: 335,
    ideaOrigin: "Explore an Idea — Chennai morning rituals",
    designedDate: "2026-06-12",
  },
  {
    id: "np-muruga-book",
    sku: "AAR-BOK-MUR-01",
    title: "Muruga Book",
    category: "Children's books",
    world: "Muruga",
    story: "A gentle telling of Muruga for young readers and gift-giving desks.",
    variants: [{ id: "var-mb-std", label: "Standard edition", sku: "AAR-BOK-MUR-01" }],
    currentInventory: 64,
    registrations: 1,
    currentLifecycleStatus: "In Circulation",
    sellingPrice: 499,
    cost: 165,
    ideaOrigin: "Muruga World Launch",
    designedDate: "2026-05-20",
  },
  {
    id: "np-welcome-kit",
    sku: "AAR-KIT-WEL-01",
    title: "Welcome Kit",
    category: "Hampers",
    world: "Chennai",
    story: "A rooted welcome set for new joiners — tote, magnet, story card.",
    variants: [{ id: "var-wk-std", label: "Standard kit", sku: "AAR-KIT-WEL-01" }],
    currentInventory: 0,
    registrations: 18,
    currentLifecycleStatus: "In Circulation – User Unknown",
    sellingPrice: 1450,
    cost: 720,
    ideaOrigin: "Your Story. Our Telling. — corporate welcome",
    designedDate: "2026-06-01",
  },
  {
    id: "np-chennai-tote",
    sku: "AAR-TOT-CHN-01",
    title: "Chennai Market Tote",
    category: "Tote bags",
    world: "Chennai",
    story: "A market bag for the everyday Chennai errand.",
    variants: [{ id: "var-tot-std", label: "Natural canvas", sku: "AAR-TOT-CHN-01" }],
    currentInventory: 48,
    registrations: 2,
    currentLifecycleStatus: "In Inventory",
    sellingPrice: 780,
    cost: 290,
    ideaOrigin: "Chennai World",
    designedDate: "2026-04-08",
  },
];

export const batches: ManufacturingBatch[] = [
  {
    id: "batch-kb",
    batchNumber: "KB-2026-07-01",
    productId: "np-kolam",
    vendorId: "nv-sizzle",
    manufactureDate: "2026-07-01",
    receivedDate: "2026-07-12",
    quantityProduced: 50,
    accepted: 47,
    damaged: 3,
    notes: "Print registration strong. Three units with rim dent — held as damaged.",
  },
  {
    id: "batch-mb",
    batchNumber: "MB-2026-06-15",
    productId: "np-muruga-book",
    vendorId: "nv-pondy",
    manufactureDate: "2026-06-15",
    receivedDate: "2026-06-22",
    quantityProduced: 200,
    accepted: 198,
    damaged: 2,
    notes: "Cover laminate excellent.",
  },
  {
    id: "batch-wk",
    batchNumber: "WK-2026-07-05",
    productId: "np-welcome-kit",
    vendorId: "nv-pondy",
    manufactureDate: "2026-07-05",
    receivedDate: "2026-07-10",
    quantityProduced: 500,
    accepted: 500,
    damaged: 0,
    notes: "Corporate allocation for Infosys welcome kits.",
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
    ownedProducts: ["np-kolam"],
    registeredProducts: ["np-kolam"],
    createdAt: "2026-07-14",
    timeline: [
      { date: "2026-07-14", label: "Purchased Kolam Bottle via Shopify", href: "/products/np-kolam" },
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
      { date: "2026-07-10", label: "Purchased Muruga Book as gift", href: "/products/np-muruga-book" },
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
    ownedProducts: ["np-muruga-book"],
    registeredProducts: ["np-muruga-book"],
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
    ownedProducts: ["np-chennai-tote"],
    registeredProducts: [],
    createdAt: "2026-07-19",
    timeline: [
      { date: "2026-07-19", label: "Purchased Chennai Market Tote", href: "/products/np-chennai-tote" },
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
    ownedProducts: ["np-welcome-kit"],
    registeredProducts: ["np-welcome-kit"],
    createdAt: "2026-07-20",
    timeline: [
      { date: "2026-07-15", label: "Received Infosys Welcome Kit" },
      { date: "2026-07-20", label: "Registered Welcome Kit", href: "/registrations" },
    ],
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

export const partners: Partner[] = [
  {
    id: "pt-freshly",
    name: "Freshly Brewed",
    partnerType: "Café",
    location: "Alwarpet, Chennai",
    contact: "hello@freshlybrewed.example",
    paymentStatus: "Current",
    margin: 28,
    currentInventory: [
      { productId: "np-kolam", quantity: 8 },
      { productId: "np-chennai-tote", quantity: 6 },
      { productId: "np-muruga-book", quantity: 12 },
    ],
    replenishmentHistory: [
      { date: "2026-07-13", productId: "np-kolam", quantity: 8, note: "Initial transfer from studio" },
      { date: "2026-07-15", productId: "np-muruga-book", quantity: 12, note: "Shelf story display" },
    ],
    merchandisingNotes: "Bottles on counter near pastry case. Books on quiet table.",
    displayPhotos: ["Counter vignette", "Shelf story"],
    registeredUsersOriginatingHere: 2,
    productsSold: 14,
  },
  {
    id: "pt-nimalli",
    name: "Nimalli",
    partnerType: "Retail Partner",
    location: "Besant Nagar, Chennai",
    contact: "studio@nimalli.example",
    paymentStatus: "Pending",
    margin: 32,
    currentInventory: [
      { productId: "np-kolam", quantity: 10 },
      { productId: "np-chennai-tote", quantity: 4 },
    ],
    replenishmentHistory: [
      { date: "2026-07-13", productId: "np-kolam", quantity: 10, note: "Window display set" },
    ],
    merchandisingNotes: "Kolam bottles facing street window. Needs photo update.",
    displayPhotos: ["Window display"],
    registeredUsersOriginatingHere: 1,
    productsSold: 7,
  },
  {
    id: "pt-ngs",
    name: "NGS",
    partnerType: "Distributor",
    location: "Teynampet, Chennai",
    contact: "buy@ngs.example",
    paymentStatus: "Current",
    margin: 22,
    currentInventory: [{ productId: "np-muruga-book", quantity: 20 }],
    replenishmentHistory: [
      { date: "2026-06-25", productId: "np-muruga-book", quantity: 25, note: "Opening stock" },
    ],
    merchandisingNotes: "Books in children's culture section.",
    displayPhotos: [],
    registeredUsersOriginatingHere: 0,
    productsSold: 5,
  },
];

export const stockMovements: StockMovement[] = [
  {
    id: "mv-1",
    date: "2026-07-12",
    productId: "np-kolam",
    variantId: "var-kol-cream",
    batchId: "batch-kb",
    quantity: 47,
    fromLocationId: "loc-vendor",
    toLocationId: "loc-studio",
    movementType: "Purchase Receipt",
    reference: "PO-KB-2401",
    notes: "47 accepted into Aarla Studio",
  },
  {
    id: "mv-2",
    date: "2026-07-12",
    productId: "np-kolam",
    batchId: "batch-kb",
    quantity: 3,
    fromLocationId: "loc-vendor",
    toLocationId: "loc-damage",
    movementType: "Damage",
    reference: "PO-KB-2401-QC",
    notes: "Rim dents — held",
  },
  {
    id: "mv-3",
    date: "2026-07-13",
    productId: "np-kolam",
    batchId: "batch-kb",
    quantity: 10,
    fromLocationId: "loc-studio",
    toLocationId: "loc-nimalli",
    movementType: "Transfer",
    reference: "TR-NIM-01",
    notes: "Partner transfer",
  },
  {
    id: "mv-4",
    date: "2026-07-13",
    productId: "np-kolam",
    batchId: "batch-kb",
    quantity: 8,
    fromLocationId: "loc-studio",
    toLocationId: "loc-freshly",
    movementType: "Transfer",
    reference: "TR-FB-01",
    notes: "Café counter stock",
  },
  {
    id: "mv-5",
    date: "2026-07-13",
    productId: "np-kolam",
    batchId: "batch-kb",
    quantity: 12,
    fromLocationId: "loc-studio",
    toLocationId: "loc-shopify",
    movementType: "Transfer",
    reference: "TR-SH-01",
    notes: "Allocated to Shopify fulfilment",
  },
  {
    id: "mv-6",
    date: "2026-07-14",
    productId: "np-kolam",
    batchId: "batch-kb",
    quantity: 1,
    fromLocationId: "loc-shopify",
    toLocationId: "loc-customer",
    movementType: "Shopify Sale",
    reference: "ORD-KOL-01",
    notes: "Sold to Vanipriya",
  },
  {
    id: "mv-7",
    date: "2026-07-10",
    productId: "np-muruga-book",
    batchId: "batch-mb",
    quantity: 1,
    fromLocationId: "loc-shopify",
    toLocationId: "loc-customer",
    movementType: "Gift",
    reference: "ORD-MB-01",
    notes: "Raghavan purchased · gifted to Ananya",
  },
  {
    id: "mv-8",
    date: "2026-07-11",
    productId: "np-welcome-kit",
    batchId: "batch-wk",
    quantity: 500,
    fromLocationId: "loc-studio",
    toLocationId: "loc-infosys",
    movementType: "Corporate Allocation",
    reference: "ORD-INFO-500",
    notes: "Infosys welcome kits",
  },
  {
    id: "mv-9",
    date: "2026-07-16",
    productId: "np-kolam",
    batchId: "batch-kb",
    quantity: 1,
    fromLocationId: "loc-freshly",
    toLocationId: "loc-customer",
    movementType: "Partner Sale",
    reference: "FB-SALE-09",
    notes: "Partner sale at Freshly Brewed",
  },
];

export const registrationsSeed: ProductRegistration[] = [
  {
    registrationId: "reg-001",
    productId: "np-kolam",
    batchId: "batch-kb",
    customerId: "person-vanipriya",
    userId: "person-vanipriya",
    purchaseSource: "Website",
    registrationDate: "2026-07-16",
    registrationCode: "AARLA-KOL-7F2C",
    status: "Community",
  },
  {
    registrationId: "reg-002",
    productId: "np-muruga-book",
    batchId: "batch-mb",
    customerId: "person-raghavan",
    userId: "person-ananya",
    purchaseSource: "Gift",
    registrationDate: "2026-07-18",
    registrationCode: "AARLA-MUR-9K1A",
    status: "Community",
  },
  {
    registrationId: "reg-003",
    productId: "np-welcome-kit",
    batchId: "batch-wk",
    organizationId: "org-infosys",
    userId: "person-arjun",
    purchaseSource: "Corporate Gift",
    registrationDate: "2026-07-20",
    registrationCode: "AARLA-WEL-3D8P",
    status: "Community",
  },
  {
    registrationId: "reg-004",
    productId: "np-kolam",
    batchId: "batch-kb",
    userId: "person-meera",
    partnerId: "pt-freshly",
    purchaseSource: "Retail Partner",
    registrationDate: "2026-07-17",
    registrationCode: "AARLA-KOL-2M4Q",
    status: "Registered",
  },
  {
    registrationId: "reg-005",
    productId: "np-kolam",
    batchId: "batch-kb",
    userId: "person-arjun",
    partnerId: "pt-nimalli",
    purchaseSource: "Retail Partner",
    registrationDate: "2026-07-21",
    registrationCode: "AARLA-KOL-8H5R",
    status: "Registered",
  },
];

export function getInventorySnapshots(): InventorySnapshot[] {
  return networkProducts.map((p) => {
    const partnerStock = partners.reduce((sum, pt) => {
      const row = pt.currentInventory.find((i) => i.productId === p.id);
      return sum + (row?.quantity ?? 0);
    }, 0);
    const damaged = batches
      .filter((b) => b.productId === p.id)
      .reduce((sum, b) => sum + b.damaged, 0);
    const studioStock = p.currentInventory;
    const reserved = p.id === "np-kolam" ? 2 : 0;
    return {
      productId: p.id,
      studioStock,
      partnerStock,
      reserved,
      damaged,
      available: Math.max(studioStock - reserved, 0),
    };
  });
}

export function buildProductJourney(productId: string): JourneyStage[] {
  const product = networkProducts.find((p) => p.id === productId);
  if (!product) return [];

  const batch = batches.find((b) => b.productId === productId);
  const vendor = batch ? networkVendors.find((v) => v.id === batch.vendorId) : undefined;
  const transfers = stockMovements.filter(
    (m) => m.productId === productId && m.movementType === "Transfer",
  );
  const regs = registrationsSeed.filter((r) => r.productId === productId);

  const stages: JourneyStage[] = [
    {
      id: "designed",
      label: "Designed",
      detail: `${product.ideaOrigin} · ${product.designedDate}`,
      href: "/explore",
      tone: "muted",
    },
  ];

  if (vendor) {
    stages.push({
      id: "vendor",
      label: "Vendor",
      detail: vendor.company,
      href: `/inventory?tab=batches`,
      tone: "default",
    });
  }

  if (batch) {
    stages.push({
      id: "batch",
      label: "Batch",
      detail: batch.batchNumber,
      href: `/inventory?tab=batches`,
      tone: "accent",
    });
    stages.push({
      id: "received",
      label: "Received",
      detail: `Aarla Studio · ${batch.accepted} Accepted · ${batch.damaged} Damaged`,
      href: "/receive",
      tone: batch.damaged ? "warning" : "default",
    });
  }

  if (transfers.length) {
    const bits = transfers.map((t) => {
      const loc = locations.find((l) => l.id === t.toLocationId);
      return `${t.quantity} ${loc?.name ?? t.toLocationId}`;
    });
    stages.push({
      id: "transferred",
      label: "Transferred",
      detail: bits.join(" · "),
      href: "/inventory?tab=movements",
      tone: "default",
    });
  }

  if (productId === "np-kolam") {
    stages.push({
      id: "customer",
      label: "Customer",
      detail: "Vanipriya",
      href: "/people/person-vanipriya",
      tone: "default",
    });
    stages.push({
      id: "user",
      label: "User",
      detail: "Vanipriya",
      href: "/people/person-vanipriya",
      tone: "success",
    });
    stages.push({
      id: "registered",
      label: "Registered",
      detail: `${regs.length} registrations`,
      href: "/registrations",
      tone: "success",
    });
    stages.push({
      id: "community",
      label: "Community",
      detail: "Known users in the Aarla community",
      href: "/people?filter=community",
      tone: "accent",
    });
  } else if (productId === "np-muruga-book") {
    stages.push({
      id: "customer",
      label: "Customer",
      detail: "Raghavan",
      href: "/people/person-raghavan",
    });
    stages.push({
      id: "user",
      label: "User",
      detail: "Ananya (gift recipient)",
      href: "/people/person-ananya",
      tone: "success",
    });
    stages.push({
      id: "registered",
      label: "Registered",
      detail: "Ananya registered the book",
      href: "/registrations",
      tone: "success",
    });
    stages.push({
      id: "community",
      label: "Community",
      detail: "Ananya joined the community",
      href: "/people/person-ananya",
      tone: "accent",
    });
  } else if (productId === "np-welcome-kit") {
    stages.push({
      id: "customer",
      label: "Customer",
      detail: "Infosys · 500 kits",
      href: "/partners",
    });
    stages.push({
      id: "circulation",
      label: "In Circulation – User Unknown",
      detail: "482 of 500 not yet registered",
      href: "/registrations",
      tone: "warning",
    });
    stages.push({
      id: "registered",
      label: "Registered",
      detail: "18 known users so far",
      href: "/registrations",
      tone: "success",
    });
  } else {
    stages.push({
      id: "inventory",
      label: "In Inventory",
      detail: `${product.currentInventory} at studio / partners`,
      href: "/inventory",
      tone: "muted",
    });
  }

  return stages;
}

export function getLocationName(id: string) {
  return locations.find((l) => l.id === id)?.name ?? id;
}

export function getProductTitle(id: string) {
  return networkProducts.find((p) => p.id === id)?.title ?? id;
}

export function getPersonName(id: string) {
  return peopleSeed.find((p) => p.id === id)?.name ?? id;
}

export function getPartnerName(id: string) {
  return partners.find((p) => p.id === id)?.name ?? id;
}
