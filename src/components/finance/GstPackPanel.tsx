"use client";

import { useState, useTransition } from "react";
import type { GstAccountantPackMeta, GstBoard } from "@/lib/domain/gst-types";
import {
  generateGstPackAction,
  getGstPackDownloadAction,
  markGstPackSentAction,
} from "@/app/actions/gst-actions";

function downloadBase64(filename: string, base64: string, contentType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function GstPackPanel({
  board,
  onChanged,
}: {
  board: GstBoard;
  onChanged: (next?: GstBoard) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recipient, setRecipient] = useState(
    board.settings.accountantEmail || board.settings.accountantName || "",
  );

  function generate() {
    startTransition(async () => {
      setError(null);
      const res = await generateGstPackAction({
        financialYear: board.period.financialYear,
        month: board.period.month,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onChanged(res.data.board);
    });
  }

  function download(pack: GstAccountantPackMeta) {
    startTransition(async () => {
      setError(null);
      const res = await getGstPackDownloadAction(pack.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      downloadBase64(res.data.filename, res.data.bytesBase64, res.data.contentType);
    });
  }

  function markSent(pack: GstAccountantPackMeta) {
    startTransition(async () => {
      setError(null);
      const res = await markGstPackSentAction({
        packId: pack.id,
        recipient: recipient.trim() || board.settings.accountantEmail || "accountant",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onChanged(res.data);
    });
  }

  return (
    <div className="space-y-4" data-testid="gst-packs">
      <p className="text-sm text-charcoal/60">
        Generate an immutable Excel pack for your accountant. This is not GST filing
        software — download the file and mark it sent when shared.
      </p>
      <button
        type="button"
        onClick={generate}
        disabled={pending}
        className="rounded-full bg-deep-navy text-white px-4 py-1.5 text-sm disabled:opacity-50"
      >
        {pending ? "Working…" : "Generate accountant pack"}
      </button>
      <label className="block text-sm space-y-1 max-w-md">
        <span className="text-charcoal/60">Send recipient (for Mark Sent)</span>
        <input
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />
      </label>
      {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
      {board.lastSend ? (
        <p className="text-xs text-charcoal/55">
          Last sent v{board.lastSend.packVersion} to {board.lastSend.recipient} on{" "}
          {board.lastSend.sentAt.slice(0, 10)}
          {board.lastSend.exceptionCount
            ? ` · ${board.lastSend.exceptionCount} exceptions noted`
            : ""}
        </p>
      ) : null}
      <ul className="space-y-2">
        {board.packs.length === 0 ? (
          <li className="text-sm text-charcoal/50">No packs generated yet.</li>
        ) : (
          board.packs.map((pack) => (
            <li
              key={pack.id}
              className="flex flex-wrap items-center gap-2 border-b border-border py-2 text-sm"
            >
              <span className="font-medium text-deep-navy">v{pack.version}</span>
              <span className="text-charcoal/55">{pack.filename}</span>
              <span className="text-charcoal/45">{pack.exceptionCount} exceptions</span>
              <button
                type="button"
                onClick={() => download(pack)}
                disabled={pending || !pack.hasXlsx}
                className="rounded-full border border-border bg-white px-3 py-1 text-xs disabled:opacity-50"
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => markSent(pack)}
                disabled={pending}
                className="rounded-full border border-border bg-white px-3 py-1 text-xs disabled:opacity-50"
              >
                Mark Sent
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
