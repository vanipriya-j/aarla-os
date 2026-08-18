"use client";

import type { CampaignStatus } from "@/lib/domain/campaign-types";
import { StatusChip } from "@/components/ui/StatusChip";
import type { StatusTone } from "@/lib/types";

function toneFor(status: CampaignStatus): StatusTone {
  switch (status) {
    case "DRAFT":
      return "neutral";
    case "INVENTORY_PLANNING":
      return "warning";
    case "READY":
      return "info";
    case "LIVE":
      return "success";
    case "PAUSED":
      return "accent";
    case "COMPLETED":
      return "neutral";
    default:
      return "neutral";
  }
}

const LABEL: Record<CampaignStatus, string> = {
  DRAFT: "Draft",
  INVENTORY_PLANNING: "Inventory Planning",
  READY: "Ready",
  LIVE: "Live",
  PAUSED: "Paused",
  COMPLETED: "Completed",
};

export function CampaignStatusChip({ status }: { status: CampaignStatus }) {
  return <StatusChip label={LABEL[status]} tone={toneFor(status)} />;
}
