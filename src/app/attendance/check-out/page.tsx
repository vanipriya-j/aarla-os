"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { CameraCapture } from "@/components/team/CameraCapture";
import { checkOutAction } from "@/app/actions/team-actions";
import { formatAttendanceClock } from "@/lib/domain/team-types";

export default function CheckOutPage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [ackOpenWork, setAckOpenWork] = useState(false);

  const finish = (method: "camera" | "manual_self", imageBase64?: string) => {
    setError(null);
    start(async () => {
      const res = await checkOutAction({
        method,
        imageBase64: imageBase64 ?? null,
        mimeType: "image/jpeg",
        deviceMeta: {
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDoneAt(res.session?.checkOutAt ?? new Date().toISOString());
    });
  };

  return (
    <>
      <Header title="Check out" subtitle="Finish your day." />
      <main className="px-4 md:px-8 py-8 max-w-lg space-y-5" data-testid="check-out-page">
        {doneAt ? (
          <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
            <p className="font-display text-2xl text-deep-navy">
              Checked out at {formatAttendanceClock(doneAt)}
            </p>
            <Button type="button" onClick={() => router.push("/")}>
              Done
            </Button>
          </div>
        ) : !ackOpenWork ? (
          <div className="rounded-2xl border border-border bg-white p-5 space-y-4">
            <p className="text-sm text-charcoal/70">
              You may still have open items. They will remain in My Work tomorrow unless
              reassigned — checkout is not blocked.
            </p>
            <p className="text-xs text-charcoal/45">
              Current time:{" "}
              {formatAttendanceClock(new Date().toISOString())}
            </p>
            <Button type="button" onClick={() => setAckOpenWork(true)} data-testid="checkout-continue">
              Continue to camera
            </Button>
          </div>
        ) : !showManual ? (
          <CameraCapture
            confirmLabel="Confirm check-out"
            allowManualFallback
            onManualFallback={() => setShowManual(true)}
            onConfirm={({ imageBase64 }) => finish("camera", imageBase64)}
            onCancel={() => setAckOpenWork(false)}
          />
        ) : (
          <div className="rounded-xl border border-border bg-white p-4 space-y-3">
            <p className="text-sm text-charcoal/70">Manual check-out (camera unavailable).</p>
            <Button
              type="button"
              disabled={pending}
              data-testid="manual-check-out"
              onClick={() => finish("manual_self")}
            >
              Check out without camera
            </Button>
          </div>
        )}
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      </main>
    </>
  );
}
