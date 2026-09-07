"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Field, inputClass, FormSection } from "@/components/ui/FormSection";
import { changeMyPinAction } from "@/app/actions/team-actions";

export default function ChangePinPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <Header title="Choose your PIN" subtitle="Required once after your temporary password." />
      <main className="px-4 md:px-8 py-8 max-w-md">
        <form
          className="space-y-4"
          data-testid="change-pin-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (pin !== confirm) {
              setError("PINs do not match");
              return;
            }
            start(async () => {
              const res = await changeMyPinAction(pin);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.replace("/attendance/check-in");
              router.refresh();
            });
          }}
        >
          <FormSection title="New PIN / password">
            <Field label="New PIN">
              <input
                type="password"
                className={inputClass}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="new-password"
                required
                data-testid="change-pin-new"
              />
            </Field>
            <Field label="Confirm">
              <input
                type="password"
                className={inputClass}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                data-testid="change-pin-confirm"
              />
            </Field>
          </FormSection>
          {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
          <Button type="submit" disabled={pending} data-testid="change-pin-submit">
            {pending ? "Saving…" : "Save and continue"}
          </Button>
        </form>
      </main>
    </>
  );
}
