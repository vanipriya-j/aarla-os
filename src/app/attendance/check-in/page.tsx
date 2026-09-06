"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { CameraCapture } from "@/components/team/CameraCapture";
import { Field, inputClass, FormSection } from "@/components/ui/FormSection";
import {
  checkInAction,
  getMyAttendanceGateAction,
  resolveMissedCheckoutAction,
} from "@/app/actions/team-actions";
import { formatAttendanceClock } from "@/lib/domain/team-types";

export default function CheckInPage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("there");
  const [error, setError] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<string | null>(null);
  const [missed, setMissed] = useState<{
    sessionId: string;
    workDate: string;
  } | null>(null);
  const [leaveTime, setLeaveTime] = useState("");
  const [reason, setReason] = useState("");
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    getMyAttendanceGateAction().then((gate) => {
      if (gate.kind === "change_pin") {
        router.replace("/account/change-pin");
        return;
      }
      if (gate.kind === "ok" && gate.session?.checkInAt) {
        router.replace("/");
        return;
      }
      if (gate.kind === "missed_checkout" && gate.missedSession) {
        setMissed({
          sessionId: gate.missedSession.id,
          workDate: gate.missedSession.workDate,
        });
        setName(gate.displayName || "there");
        return;
      }
      if (gate.displayName) setName(gate.displayName);
    });
  }, [router]);

  const finishCheckIn = (method: "camera" | "manual_self", imageBase64?: string) => {
    setError(null);
    start(async () => {
      const res = await checkInAction({
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
      setDoneAt(res.session?.checkInAt ?? new Date().toISOString());
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 1200);
    });
  };

  if (missed) {
    return (
      <>
        <Header title="Missed checkout" subtitle="Yesterday needs a quick correction." />
        <main className="px-4 md:px-8 py-8 max-w-lg space-y-4">
          <p className="text-sm text-deep-navy">
            You didn’t check out on <strong>{missed.workDate}</strong>. Enter an approximate
            leaving time — this is audited, not silent.
          </p>
          <FormSection title="Correction">
            <Field label="Leaving time">
              <input
                type="datetime-local"
                className={inputClass}
                value={leaveTime}
                onChange={(e) => setLeaveTime(e.target.value)}
                data-testid="missed-checkout-time"
              />
            </Field>
            <Field label="Reason">
              <input
                className={inputClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Forgot to check out"
                data-testid="missed-checkout-reason"
              />
            </Field>
            {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
            <Button
              type="button"
              disabled={pending}
              data-testid="missed-checkout-submit"
              onClick={() => {
                start(async () => {
                  const res = await resolveMissedCheckoutAction({
                    sessionId: missed.sessionId,
                    checkOutAtLocal: leaveTime,
                    reason,
                  });
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setMissed(null);
                  router.refresh();
                });
              }}
            >
              Save and continue
            </Button>
          </FormSection>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Check in" subtitle="Start your day at Aarla." />
      <main className="px-4 md:px-8 py-8 max-w-lg space-y-5" data-testid="check-in-page">
        {doneAt ? (
          <div className="rounded-2xl border border-muted-green/40 bg-white p-5 space-y-2">
            <p className="font-display text-2xl text-deep-navy">
              Checked in at {formatAttendanceClock(doneAt)}
            </p>
            <p className="text-sm text-charcoal/60">Opening your workspace…</p>
          </div>
        ) : (
          <>
            <div>
              <p className="font-display text-3xl text-deep-navy">
                Good morning, {name}.
              </p>
              <p className="mt-2 text-sm text-charcoal/60">
                Confirm attendance to start your day.
              </p>
            </div>
            {!showManual ? (
              <CameraCapture
                confirmLabel="Confirm check-in"
                allowManualFallback
                onManualFallback={() => setShowManual(true)}
                onConfirm={({ imageBase64 }) => finishCheckIn("camera", imageBase64)}
              />
            ) : (
              <div className="rounded-xl border border-border bg-white p-4 space-y-3">
                <p className="text-sm text-charcoal/70">
                  Manual self check-in (camera unavailable). This is marked on the attendance
                  record — not a silent fake success from a failed camera.
                </p>
                <Button
                  type="button"
                  disabled={pending}
                  data-testid="manual-check-in"
                  onClick={() => finishCheckIn("manual_self")}
                >
                  Check in without camera
                </Button>
              </div>
            )}
            {error ? (
              <p className="text-sm text-aarla-red" data-testid="check-in-error">
                {error}
              </p>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
