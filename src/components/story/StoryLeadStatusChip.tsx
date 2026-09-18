"use client";

import type { StoryLeadStatus } from "@/lib/domain/story-lead-types";
import {
  STORY_LEAD_STATUS_LABELS,
  normalizeStoryLeadStatus,
} from "@/lib/domain/story-lead-types";
import { StatusChip } from "@/components/ui/StatusChip";
import type { StatusTone } from "@/lib/types";

function toneFor(status: StoryLeadStatus): StatusTone {
  switch (normalizeStoryLeadStatus(status)) {
    case "new":
      return "warning";
    case "reviewed":
      return "neutral";
    case "in_progress":
      return "info";
    case "qualified":
      return "accent";
    case "proposal":
      return "info";
    case "won":
      return "success";
    case "lost":
      return "danger";
    case "archived":
      return "neutral";
    default:
      return "neutral";
  }
}

export function StoryLeadStatusChip({ status }: { status: StoryLeadStatus }) {
  return (
    <StatusChip label={STORY_LEAD_STATUS_LABELS[status]} tone={toneFor(status)} />
  );
}
