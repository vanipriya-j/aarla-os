"use client";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { StatusChip, statusToneFromLabel } from "@/components/ui/StatusChip";
import type { CustomerCallQueueItem } from "@/lib/domain/customer-calls-types";

type Variant = "delivery" | "re-engagement" | "abandoned-cart";

type Props = {
  rows: CustomerCallQueueItem[];
  /** Adjusts which columns are shown for segment-specific fields. Defaults to delivery. */
  variant?: Variant;
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

function formatCartValue(subtotal?: number | null, currency?: string | null): string {
  if (subtotal == null) return "—";
  const amount = subtotal.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return currency ? `${currency} ${amount}` : amount;
}

export function CallsQueueTable({
  rows,
  variant = "delivery",
  onStart,
  onCallLater,
  onSkip,
  onHistory,
}: Props) {
  const isAbandoned = variant === "abandoned-cart";

  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      emptyMessage="No pending calls in this queue."
      columns={[
        ...(isAbandoned
          ? []
          : [
              {
                key: "order",
                header: "Order No",
                render: (r: CustomerCallQueueItem) => (
                  <span className="font-medium text-deep-navy">
                    {r.externalOrderId || "—"}
                  </span>
                ),
              },
            ]),
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
        ...(isAbandoned
          ? [
              {
                key: "cartValue",
                header: "Cart Value",
                render: (r: CustomerCallQueueItem) => (
                  <span className="tabular-nums">
                    {formatCartValue(r.cartSubtotal, r.cartCurrency)}
                  </span>
                ),
              },
              {
                key: "products",
                header: "Products",
                render: (r: CustomerCallQueueItem) => (
                  <span className="text-charcoal/75">{r.productsSummary || "—"}</span>
                ),
              },
              {
                key: "lastActivity",
                header: "Last Activity",
                render: (r: CustomerCallQueueItem) => formatDate(r.lastOrderDate),
              },
            ]
          : [
              {
                key: "ordered",
                header: "Ordered",
                render: (r: CustomerCallQueueItem) => formatDate(r.lastOrderDate),
              },
              {
                key: "delivered",
                header: "Delivered",
                render: (r: CustomerCallQueueItem) => formatDate(r.deliveredAt),
              },
            ]),
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
