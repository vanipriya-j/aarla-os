"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, Volume2 } from "lucide-react";
import { useCommerceSync } from "@/components/customer-calls/CommerceSyncProvider";

const ENABLED_KEY = "aarla.liveOrders.enabled";
const SEEN_KEY = "aarla.liveOrders.seenIds";
const POLL_MS = 45_000;
const POLL_HIDDEN_MS = 90_000;

type TickData = {
  skipped: boolean;
  reason?: string;
  ordersRead: number;
  ordersUpserted: number;
  fulfilCreated: number;
  salesPosted: number;
  salesSkipped: number;
  newFulfilmentIds: string[];
  openStockCheck: Array<{
    id: string;
    orderNumber: string;
    customerName: string | null;
  }>;
};

function newLockToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `live-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeSeen(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids).slice(-200)));
  } catch {
    /* ignore */
  }
}

function playOrderChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const tones = [880, 1175];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = now + i * 0.12;
      gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    /* ignore */
  }
}

function notifyNewOrders(
  orders: Array<{ orderNumber: string; customerName: string | null }>,
) {
  const first = orders[0];
  const title =
    orders.length === 1
      ? `New Shopify order ${first?.orderNumber ?? ""}`.trim()
      : `${orders.length} new Shopify orders`;
  const body =
    orders.length === 1
      ? first?.customerName || "Open Fulfil to stock-check"
      : orders
          .slice(0, 3)
          .map((o) => o.orderNumber)
          .join(", ");

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title, { body, tag: "aarla-live-order" });
    } catch {
      /* ignore */
    }
  }
  playOrderChime();
}

/**
 * App-wide live Shopify order desk: polls incremental sync, pulls into Fulfil,
 * plays sound + browser notification when new stock-check orders appear.
 */
export function LiveOrdersWatch() {
  const { busy } = useCommerceSync();
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const ticking = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    setEnabled(readEnabled());
    seenRef.current = readSeen();
    setHydrated(true);
  }, []);

  const runTick = useCallback(async () => {
    if (ticking.current || busy) return;
    ticking.current = true;
    const token = newLockToken();
    try {
      const res = await fetch("/api/commerce/live-orders/tick", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ lockToken: token, maxChunks: 3 }),
        cache: "no-store",
      });
      const json = (await res.json()) as
        | { ok: true; data: TickData }
        | { ok: false; error: string };
      if (!json.ok) {
        setStatus(json.error);
        return;
      }
      const data = json.data;
      if (data.skipped) {
        setStatus(data.reason ?? "Live watch skipped (sync busy)");
        return;
      }

      const openIds = data.openStockCheck.map((o) => o.id);
      if (!seededRef.current) {
        for (const id of openIds) seenRef.current.add(id);
        writeSeen(seenRef.current);
        seededRef.current = true;
        setStatus(
          data.fulfilCreated
            ? `Live watch on — pulled ${data.fulfilCreated} order(s) into Fulfil`
            : "Live watch on — listening for new Shopify orders",
        );
        return;
      }

      const fresh = data.openStockCheck.filter((o) => !seenRef.current.has(o.id));
      for (const id of openIds) seenRef.current.add(id);
      for (const id of data.newFulfilmentIds) seenRef.current.add(id);
      writeSeen(seenRef.current);

      if (fresh.length || data.fulfilCreated > 0) {
        const alertOrders =
          fresh.length > 0
            ? fresh
            : data.openStockCheck.filter((o) => data.newFulfilmentIds.includes(o.id));
        if (alertOrders.length) {
          notifyNewOrders(alertOrders);
          setAlert(
            alertOrders.length === 1
              ? `New order ${alertOrders[0]?.orderNumber} — open Fulfil`
              : `${alertOrders.length} new orders — open Fulfil`,
          );
        }
        setStatus(
          `Pulled ${data.fulfilCreated} · sales posted ${data.salesPosted}` +
            (data.ordersRead ? ` · Shopify read ${data.ordersRead}` : ""),
        );
      } else {
        setStatus(
          data.ordersRead
            ? `Checked Shopify (${data.ordersRead} order rows) — no new fulfil work`
            : "Checked Shopify — no new orders",
        );
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Live watch failed");
    } finally {
      ticking.current = false;
    }
  }, [busy]);

  useEffect(() => {
    if (!hydrated || !enabled) return;
    void runTick();
    let timer = window.setInterval(
      () => void runTick(),
      document.visibilityState === "hidden" ? POLL_HIDDEN_MS : POLL_MS,
    );
    const onVis = () => {
      window.clearInterval(timer);
      timer = window.setInterval(
        () => void runTick(),
        document.visibilityState === "hidden" ? POLL_HIDDEN_MS : POLL_MS,
      );
      if (document.visibilityState === "visible") void runTick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, hydrated, runTick]);

  const enable = async () => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignore */
      }
    }
    playOrderChime();
    seededRef.current = false;
    try {
      localStorage.setItem(ENABLED_KEY, "1");
    } catch {
      /* ignore */
    }
    setEnabled(true);
    setAlert(null);
    setStatus("Live watch enabled");
  };

  const disable = () => {
    try {
      localStorage.setItem(ENABLED_KEY, "0");
    } catch {
      /* ignore */
    }
    setEnabled(false);
    setStatus(null);
    setAlert(null);
  };

  if (!hydrated) return null;

  return (
    <div className="border-b border-border bg-white/90 px-4 py-2.5 flex flex-wrap items-center gap-3 justify-between">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-deep-navy flex items-center gap-2">
          {enabled ? (
            <Bell className="size-4 text-aarla-red" />
          ) : (
            <BellOff className="size-4 text-charcoal/45" />
          )}
          Live Shopify orders
        </p>
        <p className="text-xs text-charcoal/60">
          {enabled
            ? status ?? "Watching for new paid orders → Fulfil + Studio stock"
            : "Turn on to auto-pull new Shopify orders, alert with sound, and deduct Studio stock."}
        </p>
        {alert ? (
          <p className="text-sm text-aarla-red font-medium">
            {alert}{" "}
            <Link href="/fulfil" className="underline underline-offset-2">
              Open Fulfil
            </Link>
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {enabled ? (
          <>
            <button
              type="button"
              onClick={() => void runTick()}
              className="text-xs rounded-lg border border-border px-3 py-1.5 text-deep-navy hover:bg-pale-cream"
              disabled={busy}
            >
              Check now
            </button>
            <button
              type="button"
              onClick={disable}
              className="text-xs rounded-lg border border-border px-3 py-1.5 text-charcoal/70 hover:bg-pale-cream"
            >
              Pause
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void enable()}
            className="inline-flex items-center gap-1.5 text-xs rounded-lg bg-aarla-red text-white px-3 py-1.5 hover:opacity-95"
          >
            <Volume2 className="size-3.5" />
            Enable live alerts
          </button>
        )}
      </div>
    </div>
  );
}
