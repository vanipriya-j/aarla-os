"use client";

import { useEffect, useState, useTransition } from "react";
import { upsertManualMetricAction } from "@/app/actions/operating-metrics-actions";

type Props = {
  weekStart: string;
  followers: number | null;
  views: number | null;
  onSaved?: () => void;
};

export function ManualMetricEditor({ weekStart, followers, views, onSaved }: Props) {
  const [pending, startTransition] = useTransition();
  const [followersValue, setFollowersValue] = useState(
    followers !== null ? String(followers) : "",
  );
  const [viewsValue, setViewsValue] = useState(views !== null ? String(views) : "");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setFollowersValue(followers !== null ? String(followers) : "");
    setViewsValue(views !== null ? String(views) : "");
    setMessage(null);
  }, [weekStart, followers, views]);

  function save(kind: "followers" | "views", raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setMessage("Enter a non-negative number.");
      return;
    }
    startTransition(async () => {
      const result = await upsertManualMetricAction({
        weekStart,
        kind,
        value: Math.round(parsed),
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage("Saved.");
      onSaved?.();
    });
  }

  return (
    <div
      className="space-y-3 rounded-xl border border-border bg-white/80 p-4"
      data-testid="manual-metrics"
    >
      <div>
        <h2 className="font-display text-lg text-deep-navy">Manual social metrics</h2>
        <p className="mt-1 text-sm text-charcoal/55">
          Enter Instagram followers gained and views for this week. These are not pulled from APIs
          yet.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-charcoal/50">Followers gained</span>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step={1}
              value={followersValue}
              onChange={(e) => setFollowersValue(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2"
              data-testid="manual-followers"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => save("followers", followersValue)}
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-pale-cream disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-charcoal/50">Views</span>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step={1}
              value={viewsValue}
              onChange={(e) => setViewsValue(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2"
              data-testid="manual-views"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => save("views", viewsValue)}
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-pale-cream disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </label>
      </div>
      {message ? <p className="text-xs text-charcoal/50">{message}</p> : null}
    </div>
  );
}
