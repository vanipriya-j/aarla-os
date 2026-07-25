import { v5 as uuidv5 } from "uuid";

/** Stable namespace so demo codes always map to the same UUIDs. */
export const AARLA_NS = "a8e4c0b2-1f3d-4a5e-9c7b-2d8e6f0a1b3c";

export function stableId(code: string): string {
  return uuidv5(code, AARLA_NS);
}

export const ORG_CODE = "org-aarla";
export const ORG_ID = stableId(ORG_CODE);
