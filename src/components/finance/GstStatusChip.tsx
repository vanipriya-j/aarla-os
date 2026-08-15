"use client";

import type { GstPeriodStatus } from "@/lib/domain/gst-types";
import { StatusChip } from "@/components/ui/StatusChip";

function toneFor(status: GstPeriodStatus): "neutral" | "warning" | "info" | "success" {
  switch (status) {
    case "COLLECTING":
      return "neutral";
    case "NEEDS_REVIEW":
      return "warning";
    case "READY":
      return "info";
    case "SENT":
      return "success";
    default:
      return "neutral";
  }
}

const LABEL: Record<GstPeriodStatus, string> = {
  COLLECTING: "Collecting",
  NEEDS_REVIEW: "Needs Review",
  READY: "Ready",
  SENT: "Sent",
};

export function GstStatusChip({ status }: { status: GstPeriodStatus }) {
  return <StatusChip label={LABEL[status]} tone={toneFor(status)} />;
}
