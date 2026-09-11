"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useTransition } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import {
  addCustomVendorOrderItemAction,
  addVendorOrderItemsAction,
  advanceWorkflowAction,
  cancelVendorOrderAction,
  generateOrderPdfAction,
  getVendorOrderAction,
  listProductsForManufactureAction,
  markOrderSentAction,
  markPaymentPaidAction,
  prepareReceiveStockAction,
  prepareSendOrderAction,
  recordConfirmationAction,
  removeVendorOrderItemAction,
  reopenVendorOrderForEditAction,
  sendViaWhatsAppAction,
  updateVendorOrderItemAction,
} from "@/app/actions/manufacture-actions";
import type {
  MfgVendorProfile,
  VendorOrder,
  VendorOrderCommunication,
  VendorPayment,
  WorkflowInstance,
} from "@/lib/domain/manufacture-types";
import {
  canCancelVendorOrder,
  canReopenVendorOrderForEdit,
} from "@/lib/domain/vendor-order-lifecycle";

function daysOverdue(date: string | null): number | null {
  if (!date) return null;
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  return d > 0 ? d : null;
}

async function filesToAttachments(
  files: FileList | null,
  kind: "image" | "design",
): Promise<
  Array<{ kind: "image" | "design"; filename: string; mimeType: string; contentBase64: string }>
> {
  if (!files?.length) return [];
  const out: Array<{
    kind: "image" | "design";
    filename: string;
    mimeType: string;
    contentBase64: string;
  }> = [];
  for (const file of Array.from(files)) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
    out.push({
      kind,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      contentBase64: btoa(binary),
    });
  }
  return out;
}

function VendorOrderDetailInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const orderNumber = decodeURIComponent(params.id);
  const prefillProduct = search.get("addProduct") || search.get("make");
  const prefillVariant = search.get("variant");
  const prefillQty = Number(search.get("qty") ?? "20");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<VendorOrder | null>(null);
  const [vendor, setVendor] = useState<MfgVendorProfile | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowInstance | null>(null);
  const [payments, setPayments] = useState<VendorPayment[]>([]);
  const [comms, setComms] = useState<VendorOrderCommunication[]>([]);
  const [preview, setPreview] = useState<{
    message: string;
    whatsappUrl: string;
    whatsappNumber: string;
    vendorName: string;
    pdfVersionNumber: number | null;
    pdfDownloadPath: string;
  } | null>(null);
  const [confirmDate, setConfirmDate] = useState("");
  const [confirmPrice, setConfirmPrice] = useState("");
  const [confirmNotes, setConfirmNotes] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [products, setProducts] = useState<
    Array<{
      id: string;
      title: string;
      sku: string;
      variants: Array<{ id: string; label: string; sku: string }>;
    }>
  >([]);
  const [addProductId, setAddProductId] = useState(prefillProduct ?? "");
  const [addVariantId, setAddVariantId] = useState(prefillVariant ?? "");
  const [addQty, setAddQty] = useState(Number.isFinite(prefillQty) && prefillQty > 0 ? prefillQty : 20);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [pdfReadyUrl, setPdfReadyUrl] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [customQty, setCustomQty] = useState(10);
  const [customDescription, setCustomDescription] = useState("");
  const [customImages, setCustomImages] = useState<FileList | null>(null);
  const [customDesigns, setCustomDesigns] = useState<FileList | null>(null);

  const load = () => {
    startTransition(async () => {
      setError(null);
      const [r, p] = await Promise.all([
        getVendorOrderAction(orderNumber),
        listProductsForManufactureAction(),
      ]);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOrder(r.data.order);
      setVendor(r.data.vendor);
      setWorkflow(r.data.workflow);
      setPayments(r.data.payments);
      setComms(r.data.communications);
      setQtyDrafts(
        Object.fromEntries(r.data.order.items.map((i) => [i.id, String(i.quantity)])),
      );
      if (r.data.order.vendorCommittedDate) {
        setConfirmDate(r.data.order.vendorCommittedDate);
      }
      if (p.ok) {
        setProducts(p.data);
        setAddProductId((prev) => prev || prefillProduct || p.data[0]?.id || "");
        if (prefillVariant) setAddVariantId(prefillVariant);
      }
    });
  };

  useEffect(() => {
    load();
  }, [orderNumber]);

  const overdue = daysOverdue(order?.vendorCommittedDate ?? null);
  const paid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const outstanding = payments
    .filter((p) => p.status === "due")
    .reduce((s, p) => s + p.amount, 0);
  const totalItems = order?.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) ?? 0;
  const canEditLines = order?.status === "draft" || order?.status === "ready_to_send";
  const showCancel = order ? canCancelVendorOrder(order.status) : false;
  const showEditResend = order ? canReopenVendorOrderForEdit(order.status) : false;
  const isCancelled = order?.status === "cancelled";
  const addProduct = products.find((p) => p.id === addProductId);

  function addLine() {
    if (!addProduct) {
      setError("Pick a product to add.");
      return;
    }
    const variant = addProduct.variants.find((v) => v.id === addVariantId);
    startTransition(async () => {
      const r = await addVendorOrderItemsAction(orderNumber, [
        {
          productCode: addProduct.id,
          variantCode: variant?.id ?? null,
          title: addProduct.title,
          variantLabel: variant?.label ?? "",
          sku: variant?.sku || addProduct.sku,
          quantity: addQty,
        },
      ]);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOrder(r.data);
      setQtyDrafts(Object.fromEntries(r.data.items.map((i) => [i.id, String(i.quantity)])));
      setAddQty(20);
      setAddVariantId("");
      setError(null);
    });
  }

  function saveLineQty(itemId: string) {
    const raw = qtyDrafts[itemId];
    const quantity = Math.floor(Number(raw));
    if (!Number.isFinite(quantity) || quantity < 1) {
      setError("Quantity must be at least 1.");
      return;
    }
    startTransition(async () => {
      const r = await updateVendorOrderItemAction(orderNumber, itemId, { quantity });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOrder(r.data);
      setQtyDrafts(Object.fromEntries(r.data.items.map((i) => [i.id, String(i.quantity)])));
      setError(null);
    });
  }

  function removeLine(itemId: string) {
    startTransition(async () => {
      const r = await removeVendorOrderItemAction(orderNumber, itemId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOrder(r.data);
      setQtyDrafts(Object.fromEntries(r.data.items.map((i) => [i.id, String(i.quantity)])));
      setError(null);
    });
  }

  function addCustomLine() {
    if (!customName.trim()) {
      setError("Custom item needs a name.");
      return;
    }
    startTransition(async () => {
      try {
        const [images, designs] = await Promise.all([
          filesToAttachments(customImages, "image"),
          filesToAttachments(customDesigns, "design"),
        ]);
        const r = await addCustomVendorOrderItemAction(orderNumber, {
          name: customName.trim(),
          quantity: customQty,
          description: customDescription.trim(),
          attachments: [...images, ...designs],
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setOrder(r.data);
        setQtyDrafts(Object.fromEntries(r.data.items.map((i) => [i.id, String(i.quantity)])));
        setCustomName("");
        setCustomQty(10);
        setCustomDescription("");
        setCustomImages(null);
        setCustomDesigns(null);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function generatePdf() {
    // Open synchronously on click so popup blockers don't block the later navigation.
    const pdfUrl = `/api/manufacture/orders/${encodeURIComponent(orderNumber)}/pdf`;
    setPdfReadyUrl(null);
    const tab = window.open("about:blank", "_blank");
    startTransition(async () => {
      const r = await generateOrderPdfAction(orderNumber);
      if (!r.ok) {
        setError(r.error);
        tab?.close();
        return;
      }
      if (tab && !tab.closed) {
        tab.location.href = pdfUrl;
        setPdfReadyUrl(null);
      } else {
        // Popup blocked — offer a normal link (user click is allowed).
        setPdfReadyUrl(pdfUrl);
      }
      load();
    });
  }

  function openPreview() {
    startTransition(async () => {
      const r = await prepareSendOrderAction(orderNumber);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPreview(r.data);
      setEditMessage(r.data.message);
    });
  }

  function sendWhatsApp() {
    startTransition(async () => {
      const r = await sendViaWhatsAppAction(orderNumber);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      window.open(r.data.whatsappUrl, "_blank");
      load();
      openPreview();
    });
  }

  function markSent() {
    startTransition(async () => {
      const r = await markOrderSentAction(orderNumber);
      if (!r.ok) setError(r.error);
      else load();
    });
  }

  function recordConfirm(yes: boolean) {
    startTransition(async () => {
      const r = await recordConfirmationAction({
        orderNumber,
        confirmed: yes,
        committedDeliveryDate: confirmDate || null,
        confirmedPrice: confirmPrice ? Number(confirmPrice) : null,
        vendorNotes: confirmNotes,
      });
      if (!r.ok) setError(r.error);
      else load();
    });
  }

  function advance() {
    startTransition(async () => {
      const r = await advanceWorkflowAction(orderNumber);
      if (!r.ok) setError(r.error);
      else load();
    });
  }

  function pay(id: string) {
    startTransition(async () => {
      const r = await markPaymentPaidAction(id);
      if (!r.ok) setError(r.error);
      else load();
    });
  }

  function receiveStock() {
    startTransition(async () => {
      const r = await prepareReceiveStockAction(orderNumber);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      window.location.href = r.data.receiveHref;
    });
  }

  function cancelOrder() {
    const ok = window.confirm(
      `Cancel ${orderNumber}?\n\nThis marks the PO cancelled. Unpaid schedule lines are cancelled. You won’t be able to send it again unless you create a new order.`,
    );
    if (!ok) return;
    const reason = window.prompt("Optional note for the activity log (why cancelled):", "") ?? "";
    startTransition(async () => {
      const r = await cancelVendorOrderAction(orderNumber, reason.trim() || undefined);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOrder(r.data);
      setError(null);
      load();
    });
  }

  function editAndResend() {
    const ok = window.confirm(
      `Edit & resend ${orderNumber}?\n\nThis retracts the PO back to “ready to send” so you can change lines, regenerate the PDF, and Preview / Send again. The vendor’s previous confirmation is cleared.`,
    );
    if (!ok) return;
    const reason =
      window.prompt("Optional note for the activity log (what changed):", "") ?? "";
    startTransition(async () => {
      const r = await reopenVendorOrderForEditAction(
        orderNumber,
        reason.trim() || undefined,
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOrder(r.data);
      setQtyDrafts(
        Object.fromEntries(r.data.items.map((i) => [i.id, String(i.quantity)])),
      );
      setError(null);
      setPreview(null);
      load();
    });
  }

  function followUp() {
    if (!vendor) return;
    const phone = (vendor.whatsappNumber || vendor.phone || "").replace(/\D/g, "");
    const num = phone.length === 10 ? `91${phone}` : phone;
    const msg = [
      `Hi ${vendor.contactPerson || vendor.name},`,
      "",
      `Following up on Aarla order ${orderNumber}.`,
      overdue ? `It looks overdue by ${overdue} day(s) vs committed ${order?.vendorCommittedDate}.` : "Could you share an update on current stage?",
      "",
      "Thank you,",
      "Aarla",
    ].join("\n");
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  if (!order && !error) {
    return (
      <>
        <Header title={orderNumber} subtitle="Loading vendor order…" />
        <main className="px-8 py-6 text-sm text-charcoal/50">Loading…</main>
      </>
    );
  }

  return (
    <>
      <Header
        title={orderNumber}
        subtitle={
          vendor
            ? `${vendor.name} · ${order?.status.replaceAll("_", " ") ?? ""}`
            : "Vendor order"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/manufacture/orders">
              <Button size="sm" variant="outline">
                All orders
              </Button>
            </Link>
            {showEditResend ? (
              <Button
                size="sm"
                variant="outline"
                onClick={editAndResend}
                disabled={pending}
                data-testid="vendor-order-edit-resend"
              >
                Edit & resend
              </Button>
            ) : null}
            {showCancel ? (
              <Button
                size="sm"
                variant="danger"
                onClick={cancelOrder}
                disabled={pending}
                data-testid="vendor-order-cancel"
              >
                Cancel PO
              </Button>
            ) : null}
            {!isCancelled ? (
              <>
                <Button size="sm" variant="outline" onClick={generatePdf} disabled={pending}>
                  Generate PDF
                </Button>
                <Button size="sm" onClick={openPreview} disabled={pending}>
                  Preview / Send
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <main className="px-4 md:px-8 py-6 md:py-8 pb-20 space-y-8 max-w-6xl">
        {error ? <p className="text-sm text-aarla-red">{error}</p> : null}
        {pdfReadyUrl ? (
          <p className="text-sm rounded-lg border border-deep-navy/20 bg-white px-3 py-2 text-deep-navy">
            PDF ready — popup was blocked.{" "}
            <a
              className="underline font-medium"
              href={pdfReadyUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open full tab
            </a>
          </p>
        ) : null}
        {!order ? null : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Requested", order.requestedDeliveryDate ?? "—"],
                ["Vendor committed", order.vendorCommittedDate ?? "—"],
                ["Aarla expected", order.internalExpectedDate ?? "—"],
                [
                  "Total items",
                  `${totalItems} pcs · ${order.items.length} line${order.items.length === 1 ? "" : "s"}`,
                ],
                [
                  "Order value",
                  order.pricingStatus === "pending" || order.total == null
                    ? "NA"
                    : `₹${order.total.toLocaleString("en-IN")}`,
                ],
                ["Amount paid", `₹${paid.toLocaleString("en-IN")}`],
                ["Outstanding", `₹${outstanding.toLocaleString("en-IN")}`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-border bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-charcoal/45">{k}</p>
                  <p className="mt-1 font-medium text-deep-navy">{v}</p>
                </div>
              ))}
            </section>

            {isCancelled ? (
              <div
                className="rounded-xl border border-charcoal/20 bg-charcoal/5 px-4 py-3"
                data-testid="vendor-order-cancelled-banner"
              >
                <p className="text-sm font-medium text-deep-navy">This PO is cancelled</p>
                <p className="text-xs text-charcoal/60 mt-1">
                  Lines are locked. Create a new vendor order if you need to reorder.
                </p>
              </div>
            ) : null}

            {canEditLines && order.status !== "draft" ? (
              <div className="rounded-xl border border-deep-navy/15 bg-white px-4 py-3 text-sm text-charcoal/70">
                PO is ready to edit — update lines below, then Generate PDF and Preview / Send
                again.
              </div>
            ) : null}

            {overdue != null && !["received", "closed", "cancelled"].includes(order.status) ? (
              <div className="rounded-xl border border-aarla-red/30 bg-aarla-red/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-aarla-red font-medium">
                  Overdue {overdue} day{overdue === 1 ? "" : "s"} vs vendor committed date
                </p>
                <Button size="sm" variant="danger" onClick={followUp}>
                  Follow up vendor
                </Button>
              </div>
            ) : null}

            <section className="space-y-3">
              <h2 className="font-display text-xl text-deep-navy">Line items</h2>
              <div className="space-y-2">
                {order.items.map((item) => {
                  const draftQty = qtyDrafts[item.id] ?? String(item.quantity);
                  const dirty = Number(draftQty) !== item.quantity;
                  return (
                    <div
                      key={item.id}
                      className="card-surface p-4 flex flex-wrap justify-between gap-3"
                      data-testid={`vendor-order-line-${item.id}`}
                    >
                      <div className="min-w-[12rem] flex-1">
                        <p className="font-medium text-deep-navy">
                          {item.title}
                          {item.isCustom ? (
                            <span className="ml-2 text-xs font-normal uppercase tracking-wide text-charcoal/45">
                              Custom
                            </span>
                          ) : null}
                        </p>
                        <p className="text-sm text-charcoal/65">
                          {item.isCustom
                            ? item.description || "No description"
                            : [item.variantLabel, item.colour, item.sizeLabel, item.sku]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                        {(item.catalogImageUrl || item.attachments.length > 0) ? (
                          <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap gap-2">
                              {item.catalogImageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={item.catalogImageUrl}
                                  alt={item.title}
                                  className="h-20 w-20 rounded-lg border border-border object-cover bg-white"
                                  title="Catalog design"
                                />
                              ) : null}
                              {item.attachments.map((a) => {
                                const href = `/api/manufacture/orders/${encodeURIComponent(orderNumber)}/attachments/${a.id}`;
                                const isImage =
                                  a.kind === "image" ||
                                  /\.(png|jpe?g|webp|gif)$/i.test(a.filename);
                                return isImage ? (
                                  <a
                                    key={a.id}
                                    href={href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block"
                                    title={a.filename}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={href}
                                      alt={a.filename}
                                      className="h-20 w-20 rounded-lg border border-border object-cover bg-white"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    key={a.id}
                                    className="inline-flex items-center rounded-lg border border-border bg-white px-2 py-1.5 text-xs text-deep-navy underline"
                                    href={href}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Design: {a.filename}
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="text-sm text-right text-charcoal/70 space-y-2">
                        {canEditLines ? (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <label className="text-xs text-charcoal/60">
                              Qty
                              <input
                                type="number"
                                min={1}
                                value={draftQty}
                                onChange={(e) =>
                                  setQtyDrafts((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                className="mt-1 block w-20 rounded-lg border border-border bg-white px-2 py-1.5 text-sm text-left"
                                data-testid={`vendor-order-line-qty-${item.id}`}
                              />
                            </label>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending || !dirty}
                              onClick={() => saveLineQty(item.id)}
                            >
                              {pending && dirty ? "Saving…" : "Save qty"}
                            </Button>
                            <button
                              type="button"
                              disabled={pending}
                              className="text-xs text-aarla-red underline disabled:opacity-40"
                              onClick={() => removeLine(item.id)}
                              data-testid={`vendor-order-line-remove-${item.id}`}
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <p>{item.quantity} pcs</p>
                        )}
                        <p>
                          {item.unitCost == null
                            ? "NA"
                            : `₹${item.unitCost.toLocaleString("en-IN")}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {canEditLines ? (
                <>
                  <div className="card-surface p-4 space-y-3 border-dashed border-aarla-red/25">
                    <p className="text-sm font-medium text-deep-navy">Add another product</p>
                    <p className="text-xs text-charcoal/55">
                      Same vendor PO — keep adding lines, then Preview / Send once.
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs text-charcoal/60">
                        Product
                        <select
                          value={addProductId}
                          onChange={(e) => {
                            setAddProductId(e.target.value);
                            setAddVariantId("");
                          }}
                          className="mt-1 block min-w-[14rem] max-w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-charcoal/60">
                        Variant
                        <select
                          value={addVariantId}
                          onChange={(e) => setAddVariantId(e.target.value)}
                          className="mt-1 block min-w-[10rem] rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
                        >
                          <option value="">—</option>
                          {(addProduct?.variants ?? []).map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-charcoal/60">
                        Qty
                        <input
                          type="number"
                          min={1}
                          value={addQty}
                          onChange={(e) => setAddQty(Number(e.target.value))}
                          className="mt-1 block w-20 rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
                        />
                      </label>
                      <Button size="sm" onClick={addLine} disabled={pending || !addProductId}>
                        {pending ? "Adding…" : "Add to PO"}
                      </Button>
                    </div>
                  </div>

                  <div
                    className="card-surface p-4 space-y-3 border-dashed border-deep-navy/20"
                    data-testid="vendor-order-custom-item"
                  >
                    <p className="text-sm font-medium text-deep-navy">Add custom item</p>
                    <p className="text-xs text-charcoal/55">
                      Outside the catalog — name, qty, description, images and design files.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-charcoal/60 sm:col-span-1">
                        Name
                        <input
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          placeholder="e.g. Festival gift sleeve"
                          className="mt-1 block w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
                          data-testid="custom-item-name"
                        />
                      </label>
                      <label className="text-xs text-charcoal/60">
                        Qty
                        <input
                          type="number"
                          min={1}
                          value={customQty}
                          onChange={(e) => setCustomQty(Number(e.target.value))}
                          className="mt-1 block w-24 rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
                          data-testid="custom-item-qty"
                        />
                      </label>
                      <label className="text-xs text-charcoal/60 sm:col-span-2">
                        Description
                        <textarea
                          value={customDescription}
                          onChange={(e) => setCustomDescription(e.target.value)}
                          rows={3}
                          placeholder="Specs, finish, packaging notes…"
                          className="mt-1 block w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
                          data-testid="custom-item-description"
                        />
                      </label>
                      <label className="text-xs text-charcoal/60">
                        Images
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => setCustomImages(e.target.files)}
                          className="mt-1 block w-full text-sm"
                          data-testid="custom-item-images"
                        />
                        <span className="mt-1 block text-[11px] text-charcoal/45">
                          Up to 5 images, 2 MB each
                        </span>
                      </label>
                      <label className="text-xs text-charcoal/60">
                        Design files
                        <input
                          type="file"
                          accept=".pdf,.ai,.psd,.zip,.svg,.png,.jpg,.jpeg,.webp,.fig"
                          multiple
                          onChange={(e) => setCustomDesigns(e.target.files)}
                          className="mt-1 block w-full text-sm"
                          data-testid="custom-item-designs"
                        />
                        <span className="mt-1 block text-[11px] text-charcoal/45">
                          PDF, AI, ZIP, etc. — up to 5 files, 2 MB each
                        </span>
                      </label>
                    </div>
                    <Button
                      size="sm"
                      onClick={addCustomLine}
                      disabled={pending || !customName.trim()}
                    >
                      {pending ? "Adding…" : "Add custom item"}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-charcoal/50">
                  Lines are locked after send. Create a new order to reorder more SKUs.
                </p>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-xl text-deep-navy">Current stage</h2>
                <Button size="sm" variant="outline" onClick={advance} disabled={pending || !workflow}>
                  Complete active step
                </Button>
              </div>
              {!workflow ? (
                <p className="text-sm text-charcoal/55">
                  No workflow instance yet. Approve “How this vendor works” on the vendor page so new
                  orders inherit a timeline.
                </p>
              ) : (
                <ol className="space-y-2">
                  {workflow.steps.map((s) => {
                    const done = s.status === "COMPLETED" || s.status === "SKIPPED";
                    const active = s.status === "ACTIVE" || s.status === "OVERDUE";
                    return (
                      <li
                        key={s.id}
                        className={`flex gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                          active
                            ? "border-aarla-red/40 bg-aarla-red/5"
                            : "border-border bg-white"
                        }`}
                      >
                        <span className="w-5 shrink-0 text-center">
                          {done ? "✓" : active ? "→" : "○"}
                        </span>
                        <span className={done ? "text-charcoal/50" : "text-deep-navy"}>
                          {s.name}
                          <span className="ml-2 text-xs uppercase text-charcoal/40">
                            {s.status.replaceAll("_", " ")}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {preview ? (
              <section className="card-surface p-4 space-y-4 border-aarla-red/20">
                <h2 className="font-display text-xl text-deep-navy">What the vendor will receive</h2>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase text-charcoal/45 mb-2">PDF preview</p>
                    <iframe
                      title="Order PDF"
                      src={preview.pdfDownloadPath}
                      className="h-[28rem] w-full rounded-xl border border-border bg-white"
                    />
                    <p className="mt-2 text-xs text-charcoal/50">
                      PDF v{preview.pdfVersionNumber ?? "—"} ·{" "}
                      <a
                        className="text-aarla-red underline"
                        href={preview.pdfDownloadPath}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open full tab
                      </a>
                      {" · "}
                      <a
                        className="text-aarla-red underline"
                        href={preview.pdfDownloadPath}
                        download
                      >
                        Download
                      </a>
                    </p>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs uppercase text-charcoal/45">WhatsApp message</p>
                    <p className="text-sm text-charcoal/70">
                      {preview.vendorName} · {preview.whatsappNumber}
                    </p>
                    <textarea
                      className="w-full min-h-[12rem] rounded-xl border border-border p-3 text-sm"
                      value={editMessage}
                      onChange={(e) => setEditMessage(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={sendWhatsApp} disabled={pending}>
                        Send via WhatsApp
                      </Button>
                      <Button size="sm" variant="outline" onClick={markSent} disabled={pending}>
                        Mark sent
                      </Button>
                      <Button size="sm" variant="ghost" onClick={generatePdf} disabled={pending}>
                        Generate new PDF
                      </Button>
                      <Link href={`/manufacture/orders/${encodeURIComponent(orderNumber)}`}>
                        <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                          Edit order
                        </Button>
                      </Link>
                    </div>
                    <p className="text-xs text-charcoal/50">
                      WhatsApp opens with the message prefilled. Attach the PDF manually, then mark
                      sent. Delivery/read states are not claimed until API mode exists.
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="space-y-3">
              <h2 className="font-display text-xl text-deep-navy">Vendor acknowledgement</h2>
              <div className="card-surface p-4 space-y-3">
                <div className="flex flex-wrap gap-3">
                  <label className="text-xs text-charcoal/60">
                    Committed delivery
                    <input
                      type="date"
                      value={confirmDate}
                      onChange={(e) => setConfirmDate(e.target.value)}
                      className="mt-1 block rounded-lg border border-border px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-charcoal/60">
                    Confirmed price (total)
                    <input
                      type="number"
                      value={confirmPrice}
                      onChange={(e) => setConfirmPrice(e.target.value)}
                      placeholder="optional"
                      className="mt-1 block w-36 rounded-lg border border-border px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <textarea
                  placeholder="Vendor notes"
                  value={confirmNotes}
                  onChange={(e) => setConfirmNotes(e.target.value)}
                  className="w-full rounded-xl border border-border p-3 text-sm min-h-[4rem]"
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => recordConfirm(true)} disabled={pending}>
                    Vendor confirmed
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => recordConfirm(false)}
                    disabled={pending}
                  >
                    Not confirmed
                  </Button>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-xl text-deep-navy">Payments</h2>
              {payments.length === 0 ? (
                <p className="text-sm text-charcoal/55">
                  No payment schedule yet — appears when order has confirmed pricing and advance %.
                </p>
              ) : (
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-deep-navy">
                          {p.stage}
                          {p.percentage != null ? ` · ${p.percentage}%` : ""}
                        </p>
                        <p className="text-sm text-charcoal/60">
                          ₹{p.amount.toLocaleString("en-IN")} · {p.dueWhen || p.status}
                        </p>
                      </div>
                      {p.status === "due" ? (
                        <Button size="sm" variant="outline" onClick={() => pay(p.id)}>
                          Mark paid
                        </Button>
                      ) : (
                        <span className="text-xs uppercase text-charcoal/45">{p.status}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-xl text-deep-navy">Communication</h2>
              {comms.length === 0 ? (
                <p className="text-sm text-charcoal/55">No messages logged yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {comms.map((c) => (
                    <li key={c.id} className="rounded-xl border border-border bg-white px-4 py-3">
                      <p className="text-xs text-charcoal/45">
                        {new Date(c.createdAt).toLocaleString("en-IN")} · {c.channel} · {c.direction}{" "}
                        · {c.status}
                      </p>
                      <p className="mt-1 text-charcoal/75 whitespace-pre-wrap line-clamp-4">
                        {c.message}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card-surface p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-deep-navy">Receive Stock</p>
                <p className="text-sm text-charcoal/60">
                  Inventory increases only through the Receive Stock ledger — never when the vendor
                  says production is done.
                </p>
              </div>
              <Button onClick={receiveStock} disabled={pending}>
                Receive Stock
              </Button>
            </section>
          </>
        )}
      </main>
    </>
  );
}

export default function VendorOrderDetailPage() {
  return (
    <Suspense fallback={<p className="px-8 py-6 text-sm text-charcoal/50">Loading order…</p>}>
      <VendorOrderDetailInner />
    </Suspense>
  );
}
