"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  createOrGetManufacturingPO,
  deriveBalances,
  deriveInventorySnapshots,
  ledgerStore,
  movementsSeed,
  receiveAgainstPO,
  recordPartnerSale,
  transferToPartner,
} from "./ledger";
import { purchaseOrdersSeed } from "./catalog";
import type { PurchaseOrder, StockMovement } from "./types";

/** React hook — ledger + derived inventory + PO list. */
export function useLedger() {
  const movementsRaw = useSyncExternalStore(
    ledgerStore.subscribe,
    ledgerStore.getMovementsSnapshot,
    ledgerStore.getServerSnapshot,
  );
  const posRaw = useSyncExternalStore(
    ledgerStore.subscribe,
    ledgerStore.getPOsSnapshot,
    ledgerStore.getServerSnapshot,
  );
  const hydrated = useSyncExternalStore(
    ledgerStore.subscribe,
    () => true,
    () => false,
  );

  const movements = useMemo<StockMovement[]>(
    () => (movementsRaw ? (JSON.parse(movementsRaw) as StockMovement[]) : movementsSeed),
    [movementsRaw],
  );
  const purchaseOrders = useMemo<PurchaseOrder[]>(
    () => (posRaw ? (JSON.parse(posRaw) as PurchaseOrder[]) : purchaseOrdersSeed),
    [posRaw],
  );

  const snapshots = useMemo(() => deriveInventorySnapshots(movements), [movements]);
  const balances = useMemo(() => deriveBalances(movements), [movements]);

  const receive = useCallback((input: Parameters<typeof receiveAgainstPO>[0]) => {
    return receiveAgainstPO(input);
  }, []);

  const transfer = useCallback((input: Parameters<typeof transferToPartner>[0]) => {
    return transferToPartner(input);
  }, []);

  const partnerSale = useCallback((input: Parameters<typeof recordPartnerSale>[0]) => {
    return recordPartnerSale(input);
  }, []);

  const createManufacturingPO = useCallback(
    (input: Parameters<typeof createOrGetManufacturingPO>[0]) => createOrGetManufacturingPO(input),
    [],
  );

  return {
    hydrated,
    movements,
    purchaseOrders,
    snapshots,
    balances,
    receive,
    transfer,
    partnerSale,
    createManufacturingPO,
  };
}
