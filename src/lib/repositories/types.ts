import type {
  Location,
  ManufacturingBatch,
  Partner,
  Person,
  Product,
  ProductRegistration,
  PurchaseOrder,
  ReorderRule,
  StockMovement,
  Vendor,
} from "@/lib/domain/types";

export interface OrganizationRecord {
  id: string;
  code: string;
  name: string;
}

export interface InstitutionRecord {
  id: string;
  name: string;
  type: string;
  contact: string;
  orders: string[];
  usersReached: number;
  city?: string;
}

export interface ProductRepository {
  list(): Promise<Product[]>;
  getByCode(code: string): Promise<Product | null>;
}

export interface VendorRepository {
  list(): Promise<Vendor[]>;
  getByCode(code: string): Promise<Vendor | null>;
}

export interface LocationRepository {
  list(): Promise<Location[]>;
}

export interface PartnerRepository {
  list(): Promise<Partner[]>;
  getByCode(code: string): Promise<Partner | null>;
}

export interface BatchRepository {
  list(): Promise<ManufacturingBatch[]>;
}

export interface PurchaseOrderRepository {
  list(): Promise<PurchaseOrder[]>;
  getByCode(code: string): Promise<PurchaseOrder | null>;
  upsert(po: PurchaseOrder): Promise<PurchaseOrder>;
}

export interface StockMovementRepository {
  list(): Promise<StockMovement[]>;
  append(movements: StockMovement[]): Promise<void>;
}

export interface PersonRepository {
  list(): Promise<Person[]>;
  getByCode(code: string): Promise<Person | null>;
  findByEmail(email: string): Promise<Person | null>;
  upsert(person: Person): Promise<Person>;
}

export interface RegistrationRepository {
  list(): Promise<ProductRegistration[]>;
  create(reg: ProductRegistration): Promise<ProductRegistration>;
}

export interface ReorderRuleRepository {
  list(): Promise<ReorderRule[]>;
  upsert(rule: Omit<ReorderRule, "id"> & { id?: string }): Promise<ReorderRule>;
}

export interface OpsRepository {
  listProjects(): Promise<unknown[]>;
  listContentTasks(): Promise<unknown[]>;
  listChannelOrders(): Promise<unknown[]>;
  updateChannelOrderStatus(code: string, courierStatus: string): Promise<void>;
  listLaunchChecklists(): Promise<unknown[]>;
  listHomePriorities(): Promise<unknown[]>;
  listHomeAttention(): Promise<unknown[]>;
  getDemoMetrics(): Promise<{
    dashboard: unknown;
    revenueByMonth: unknown;
    channelMix: unknown;
  }>;
  listAdviceSnippets(): Promise<{ matchKey: string; title: string; body: string }[]>;
  listTipPrompts(): Promise<string[]>;
  listStoryHampers(): Promise<unknown[]>;
  listInstitutions(): Promise<InstitutionRecord[]>;
}

export interface UnitOfWork {
  products: ProductRepository;
  vendors: VendorRepository;
  locations: LocationRepository;
  partners: PartnerRepository;
  batches: BatchRepository;
  purchaseOrders: PurchaseOrderRepository;
  movements: StockMovementRepository;
  people: PersonRepository;
  registrations: RegistrationRepository;
  reorderRules: ReorderRuleRepository;
  ops: OpsRepository;
}
