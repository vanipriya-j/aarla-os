"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { peopleSeed, registrationsSeed } from "./domain/catalog";
import type {
  Interest,
  Person,
  PersonRole,
  ProductRegistration,
  PurchaseSource,
} from "./domain/types";

const PEOPLE_KEY = "aarla-os-v02-people";
const REGS_KEY = "aarla-os-v02-registrations";

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  emit();
}

export interface RegisterInput {
  registrationCode: string;
  productId: string;
  batchId: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  purchaseSource: PurchaseSource;
  partnerId?: string;
  purchasedByYou: boolean;
  gifted: boolean;
  interests: Interest[];
  customerName?: string;
}

function getPeopleSnapshot() {
  return JSON.stringify(readJson(PEOPLE_KEY, peopleSeed));
}

function getRegsSnapshot() {
  return JSON.stringify(readJson(REGS_KEY, registrationsSeed));
}

function getServerSnapshot() {
  return "";
}

export function useNetworkStore() {
  const peopleRaw = useSyncExternalStore(subscribe, getPeopleSnapshot, getServerSnapshot);
  const regsRaw = useSyncExternalStore(subscribe, getRegsSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);

  const people = useMemo<Person[]>(
    () => (peopleRaw ? (JSON.parse(peopleRaw) as Person[]) : peopleSeed),
    [peopleRaw],
  );
  const registrations = useMemo<ProductRegistration[]>(
    () => (regsRaw ? (JSON.parse(regsRaw) as ProductRegistration[]) : registrationsSeed),
    [regsRaw],
  );

  const registerProduct = useCallback((input: RegisterInput) => {
    const currentPeople = readJson(PEOPLE_KEY, peopleSeed);
    const currentRegs = readJson(REGS_KEY, registrationsSeed);

    const existing = currentPeople.find(
      (p) => p.email.toLowerCase() === input.email.trim().toLowerCase(),
    );

    let user: Person;
    let nextPeople: Person[];

    if (existing) {
      const roles = new Set<PersonRole>(existing.roles);
      roles.add("User");
      roles.add("Community Member");
      user = {
        ...existing,
        phone: input.phone || existing.phone,
        city: input.city || existing.city,
        roles: Array.from(roles),
        interests: Array.from(new Set([...existing.interests, ...input.interests])),
        ownedProducts: Array.from(new Set([...existing.ownedProducts, input.productId])),
        registeredProducts: Array.from(new Set([...existing.registeredProducts, input.productId])),
        timeline: [
          ...(existing.timeline ?? []),
          {
            date: new Date().toISOString().slice(0, 10),
            label: "Registered product",
            href: "/registrations",
          },
        ],
      };
      nextPeople = currentPeople.map((p) => (p.id === existing.id ? user : p));
    } else {
      user = {
        id: `person-${Date.now()}`,
        name: input.name,
        email: input.email,
        phone: input.phone,
        city: input.city,
        roles: ["User", "Community Member"],
        interests: input.interests,
        purchasedOrders: [],
        ownedProducts: [input.productId],
        registeredProducts: [input.productId],
        createdAt: new Date().toISOString().slice(0, 10),
        timeline: [
          {
            date: new Date().toISOString().slice(0, 10),
            label: "Registered product and joined community",
            href: "/registrations",
          },
        ],
      };
      nextPeople = [user, ...currentPeople];
    }

    let customerId = input.purchasedByYou ? user.id : undefined;
    if (input.gifted && input.customerName) {
      const customerExisting = currentPeople.find(
        (p) => p.name.toLowerCase() === input.customerName!.trim().toLowerCase(),
      );
      if (customerExisting) customerId = customerExisting.id;
    }
    if (input.purchasedByYou) customerId = user.id;

    const reg: ProductRegistration = {
      registrationId: `reg-${Date.now()}`,
      productId: input.productId,
      batchId: input.batchId,
      customerId,
      userId: user.id,
      partnerId: input.partnerId,
      purchaseSource: input.purchaseSource,
      registrationDate: new Date().toISOString().slice(0, 10),
      registrationCode:
        input.registrationCode || `AARLA-${Date.now().toString(36).toUpperCase()}`,
      status: "Community",
    };

    writeJson(PEOPLE_KEY, nextPeople);
    writeJson(REGS_KEY, [reg, ...currentRegs]);
    return { user, registration: reg };
  }, []);

  return { people, registrations, hydrated, registerProduct };
}
