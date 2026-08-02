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

export function CallsQueueTable({ rows, onStart, onCallLater, onSkip, onHistory }: Props) {
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      emptyMessage="No pending calls in this queue."
      columns={[
        {
          key: "customer",
          header: "Customer",
          render: (r) => (
            <div>
              <p className="font-medium text-deep-navy">{r.customerName}</p>
              <p className="text-xs text-charcoal/50">{r.externalCustomerId}</p>
            </div>
          ),
        },
        { key: "phone", header: "Phone", render: (r) => r.phone },
        {
          key: "reason",
          header: "Reason",
          render: (r) => <span className="text-charcoal/75">{r.reason}</span>,
        },
        {
          key: "order",
          header: "Relevant Order / Last Order",
          render: (r) => (
            <span>
              {r.externalOrderId || "—"}
              {r.lastOrderDate ? (
                <span className="block text-xs text-charcoal/50">{r.lastOrderDate}</span>
              ) : null}
            </span>
          ),
        },
        {
          key: "products",
          header: "Products",
          render: (r) => (
            <span className="text-xs text-charcoal/70 max-w-[200px] block">{r.productsSummary || "—"}</span>
          ),
        },
        {
          key: "date",
          header: "Date",
          render: (r) =>
            r.deliveredAt?.slice(0, 10) || r.lastOrderDate || r.createdAt.slice(0, 10),
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
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => onStart(r.id)} data-testid={`start-call-${r.id}`}>
                Start Call
              </Button>
              <Button size="sm" variant="outline" onClick={() => onCallLater(r.id)}>
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
          ),
        },
      ]}
    />
  );
}
