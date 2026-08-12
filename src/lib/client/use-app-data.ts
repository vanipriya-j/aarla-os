"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  adjustStockAction,
  createManufacturingPOAction,
  getLedgerBundleAction,
  getNetworkBundleAction,
  partnerSaleAction,
  receiveAgainstPOAction,
  registerProductAction,
  transferStockAction,
  transferToPartnerAction,
} from "@/app/actions/app-actions";
import type { RegisterProductInput } from "@/lib/engine/business-engine";
import type {
  AdjustmentReason,
  InventorySnapshot,
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
import type { InstitutionRecord } from "@/lib/repositories/types";

export interface AppCatalog {
  products: Product[];
  vendors: Vendor[];
  locations: Location[];
  partners: Partner[];
  batches: ManufacturingBatch[];
  institutions: InstitutionRecord[];
}

const emptyCatalog: AppCatalog = {
  products: [],
  vendors: [],
  locations: [],
  partners: [],
  batches: [],
  institutions: [],
};

/** Client hook replacing useLedger — loads from Postgres via server actions. */
export function useAppLedger() {
  const [snapshots, setSnapshots] = useState<InventorySnapshot[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [catalog, setCatalog] = useState<AppCatalog>(emptyCatalog);
  const [reorderRules, setReorderRules] = useState<ReorderRule[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const result = await getLedgerBundleAction();
    if (!result.ok) {
      setError(result.error);
      setHydrated(true);
      return;
    }
    setError(null);
    setSnapshots(result.data.snapshots);
    setMovements(result.data.movements);
    setPurchaseOrders(result.data.purchaseOrders);
    setCatalog(result.data.catalog);
    setReorderRules(result.data.reorderRules);
    setHydrated(true);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void refresh();
    });
  }, [refresh]);

  const receive = useCallback(
    async (input: {
      poId: string;
      accepted: number;
      damaged: number;
      missing: number;
      notes: string;
    }) => {
      const result = await receiveAgainstPOAction(input);
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      await refresh();
      return result.data;
    },
    [refresh],
  );

  const transfer = useCallback(
    async (input: {
      productId: string;
      variantId?: string;
      partnerId: string;
      quantity: number;
      notes?: string;
      reference?: string;
    }) => {
      const result = await transferToPartnerAction(input);
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      await refresh();
      return result.data;
    },
    [refresh],
  );

  const partnerSale = useCallback(
    async (input: {
      productId: string;
      variantId?: string;
      partnerId: string;
      quantity: number;
      notes?: string;
      reference?: string;
    }) => {
      const result = await partnerSaleAction(input);
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      await refresh();
      return result.data;
    },
    [refresh],
  );

  const transferStock = useCallback(
    async (input: {
      productId: string;
      variantId?: string;
      fromLocationId: string;
      toLocationId: string;
      quantity: number;
      notes?: string;
      reference?: string;
    }) => {
      const result = await transferStockAction(input);
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      await refresh();
      return result.data;
    },
    [refresh],
  );

  const adjustStock = useCallback(
    async (input: {
      productId: string;
      variantId?: string;
      locationId: string;
      systemQty: number;
      physicalQty: number;
      reason: AdjustmentReason;
      notes?: string;
    }) => {
      const result = await adjustStockAction(input);
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      await refresh();
      return result.data;
    },
    [refresh],
  );

  const createManufacturingPO = useCallback(
    async (input: {
      vendorId: string;
      productId: string;
      quantity: number;
      unitCost: number;
      requiredDate: string;
      id?: string;
    }) => {
      const result = await createManufacturingPOAction(input);
      if (!result.ok) {
        setError(result.error);
        throw new Error(result.error);
      }
      await refresh();
      return result.data;
    },
    [refresh],
  );

  return {
    snapshots,
    movements,
    purchaseOrders,
    catalog,
    reorderRules,
    products: catalog.products,
    vendors: catalog.vendors,
    locations: catalog.locations,
    partners: catalog.partners,
    batches: catalog.batches,
    hydrated,
    error,
    receive,
    transfer,
    partnerSale,
    transferStock,
    adjustStock,
    createManufacturingPO,
    refresh,
  };
}

/** Client hook replacing useNetworkStore — people & registrations from Postgres. */
export function useAppNetwork() {
  const [people, setPeople] = useState<Person[]>([]);
  const [registrations, setRegistrations] = useState<ProductRegistration[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const result = await getNetworkBundleAction();
    if (!result.ok) {
      setError(result.error);
      setHydrated(true);
      return;
    }
    setError(null);
    setPeople(result.data.people);
    setRegistrations(result.data.registrations);
    setHydrated(true);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void refresh();
    });
  }, [refresh]);

  const registerProduct = useCallback(
    async (input: RegisterProductInput) => {
      const result = await registerProductAction(input);
      if (!result.ok) {
        setError(result.error);
        throw new Error(result.error);
      }
      await refresh();
      return result.data;
    },
    [refresh],
  );

  return {
    people,
    registrations,
    hydrated,
    error,
    registerProduct,
    refresh,
  };
}
