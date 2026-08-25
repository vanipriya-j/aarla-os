import type { ActionResult } from "@/lib/client/commerce-sync-api";
import {
  clearCommerceSyncLockViaApi,
  unlockCommerceSyncLockViaApi,
} from "@/lib/client/commerce-sync-api";

const TRANSIENT_RE =
  /timed out|unexpected response|failed to fetch|networkerror|load failed|504|503|502|408|function_invocation|aborted|unexpected end|invalid response|already in progress|stuck sync lock|sync lock/i;

export function isTransientCommerceSyncError(error: string): boolean {
  return TRANSIENT_RE.test(error);
}

export function newCommerceSyncLockToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run one sync chunk; on Vercel timeout / lock conflict, unlock (keep resume
 * cursor) and retry with a fresh lock token until success or attempts exhausted.
 */
export async function runChunkWithAutoRetry<T>(options: {
  getToken: () => string;
  setToken: (token: string) => void;
  attempt: (lockToken: string) => Promise<ActionResult<T>>;
  onRetry?: (attempt: number, maxAttempts: number, error: string) => void;
  maxAttempts?: number;
}): Promise<ActionResult<T>> {
  const maxAttempts = options.maxAttempts ?? 8;
  let last: ActionResult<T> = { ok: false, error: "Sync failed" };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await options.attempt(options.getToken());
    if (last.ok) return last;

    if (!isTransientCommerceSyncError(last.error) || attempt === maxAttempts) {
      return last;
    }

    options.onRetry?.(attempt, maxAttempts, last.error);
    // Unlock only — do NOT wipe resume cursors (that is the manual Clear button).
    await unlockCommerceSyncLockViaApi().catch(() => clearCommerceSyncLockViaApi());
    options.setToken(newCommerceSyncLockToken());
    await sleep(Math.min(2000 * attempt, 8000));
  }

  return last;
}
