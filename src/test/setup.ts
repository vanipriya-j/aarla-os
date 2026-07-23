import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetLedgerStorage, setMovementIdGenerator } from "@/lib/domain/ledger";

afterEach(() => {
  cleanup();
  setMovementIdGenerator(null);
  resetLedgerStorage();
  window.localStorage.clear();
});
