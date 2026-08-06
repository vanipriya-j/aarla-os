"use client";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import type { CustomerCallQueueItem } from "@/lib/domain/customer-calls-types";

type Props = {
  rows: CustomerCallQueueItem[];
  onStart: (id: string) => void;
  onCallLater: (id: string) => void;
  onSkip: (id: string) => void;
  onHistory: (customerId: string) => void;
};

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString();
}

export function CallsQueueTable({ rows, onStart, onCallLater, onSkip, onHistory }: Props) {
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      emptyMessage="No pending calls in this queue."
      columns={[
        {
          key: "order",
          header: "Order No",
          render: (r) => (
            <span className="font-medium text-deep-navy">{r.externalOrderId || "—"}</span>
          ),
        },
        {
          key: "customer",
          header: "Customer Name",
          render: (r) => <span className="text-deep-navy">{r.customerName}</span>,
        },
        {
          key: "phone",
          header: "Phone",
          render: (r) =>
            r.phone === "Phone missing" ? (
              <span className="text-xs rounded-md bg-aarla-red/10 text-aarla-red px-2 py-1">
                Phone missing
              </span>
            ) : (
              <span className="tabular-nums">{r.phone}</span>
            ),
        },
        {
          key: "ordered",
          header: "Ordered",
          render: (r) => formatDate(r.lastOrderDate),
        },
        {
          key: "delivered",
          header: "Delivered",
          render: (r) => formatDate(r.deliveredAt),
        },
        {
          key: "status",
          header: "Status",
          render: (r) => <StatusChip label={r.status} tone={statusToneFromLabel(r.status)} />,
        },
        {
          key: "action",
          header: "Action",
          render: (r) => (
            <div className="flex flex-col items-start gap-1">
              <Button size="sm" onClick={() => onStart(r.id)} data-testid={`start-call-${r.id}`}>
                Start Call
              </Button>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" onClick={() => onCallLater(r.id)}>
                  Call Later
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onSkip(r.id)}>
                  Skip
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onHistory(r.externalCustomerId)}
                >
                  View History
                </Button>
              </div>
            </div>
          ),
        },
      ]}
    />
  );
}
