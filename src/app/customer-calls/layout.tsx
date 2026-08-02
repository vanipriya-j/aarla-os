import type { ReactNode } from "react";

/**
 * Allow longer Shopify sync chunks on Vercel (Pro default up to 60s).
 * Sync is still chunked client-side so Hobby plans degrade gracefully.
 */
export const maxDuration = 60;

export default function CustomerCallsLayout({ children }: { children: ReactNode }) {
  return children;
}
