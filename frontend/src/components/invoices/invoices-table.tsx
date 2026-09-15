"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeEuro, Download, Eye, FileCheck2, FileSpreadsheet, Loader2, Mail, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { bulkInvoiceAction, type BulkOp, type BulkResult } from "@/app/actions/bulk";
import { businessDate, formatDate, formatMoney } from "@/lib/invoice/totals";
import { getDocumentType } from "@/lib/greek/document-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge, MyDataStatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { TagList } from "@/components/tags/tag-input";
import { Badge } from "@/components/ui/badge";
import { B2G_STATUS_LABELS } from "@/lib/b2g/providers";

export interface InvoiceRow {
  id: string;
  displayNumber: string;
  invoiceType: string;
  customerName: string | null;
  tags?: string[];
  issueDate: string;
  dueDate: string | null;
  totalNetValue: number;
  totalGrossValue: number;
  paidAmount: number;
  currency: string;
  status: string;
  mydataStatus: string;
  mydataMark: string | null;
  b2gStatus?: string;
  emailedAt: string | null;
  viewedAt?: string | null;
}

function summarize(op: BulkOp, r: BulkResult) {
  const noun = op === "transmit" ? "διαβιβάστηκαν" : op === "email" ? "στάλθηκαν" : op === "issue" ? "εκδόθηκαν" : op === "mark_paid" ? "εξοφλήθηκαν" : "διαγράφηκαν";
  const parts = [`${r.done} ${noun}`];
  if (r.skipped) parts.push(`${r.skipped} παραλείφθηκαν (μη επιλέξιμα)`);
  if (r.failed.length) parts.push(`${r.failed.length} απέτυχαν`);
  return parts.join(" · ");
}

export function InvoicesTable({ rows, canWrite, mock }: { rows: InvoiceRow[]; canWrite: boolean; mock: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;
  const ids = Array.from(selected).filter((id) => rows.some((r) => r.id === id));
  const chosen = rows.filter((r) => selected.has(r.id));
  const drafts = chosen.filter((r) => r.status === "draft").length;
  const transmittable = chosen.filter((r) => r.status !== "draft" && r.status !== "cancelled" && !r.mydataMark && getDocumentType(r.invoiceType).kind !== "quote").length;
  const emailable = chosen.filter((r) => r.status !== "draft").length;
  const payable = chosen.filter((r) => r.status !== "draft" && r.status !== "cancelled" && r.totalGrossValue - r.paidAmount > 0.005).length;

  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const run = (op: BulkOp, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    start(async () => {
      const r = await bulkInvoiceAction(op, ids);
      if (!r.ok) {
        toast.error(r.error ?? "Η ενέργεια απέτυχε.");
        return;
      }
      const msg = summarize(op, r);
      if (r.failed.length) toast.warning(msg, { description: r.failed.slice(0, 5).map((f) => `${f.label}: ${f.error}`).join("\n") });
      else toast.success(msg, { description: r.warning });
      setSelected(new Set());
      router.refresh();
    });
  };

  const download = (format: "zip" | "csv") => {
    // Λήψη αρχείου (όχι πλοήγηση σε σελίδα): προσωρινός σύνδεσμος με download attribute.
    const a = document.createElement("a");
    a.href = `/api/invoices/bulk?ids=${encodeURIComponent(ids.join(","))}&format=${format}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="min-w-0 max-w-full rounded-xl border bg-card">
      <p className="border-b px-3 py-2 text-xs text-muted-foreground" data-testid="invoice-list-help">Τα πιστωτικά εμφανίζονται με αρνητικά ποσά. Η εξόφληση, η διαβίβαση myDATA και η αποδοχή B2G είναι διαφορετικές καταστάσεις.</p>
      <p className="px-3 py-2 text-xs text-muted-foreground sm:hidden" data-testid="invoice-table-mobile-hint">Αριθμός, πελάτης, σύνολο και κατάσταση. Ανοίξτε το παραστατικό για όλες τις λεπτομέρειες.</p>
      {ids.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">{ids.length} επιλεγμένα</span>
          <div className="flex flex-wrap gap-1.5">
            {canWrite && drafts > 0 ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run("issue", `Μαζική έκδοση ${drafts} πρόχειρων παραστατικών; Θα αποδοθούν οριστικοί αριθμοί.`)} data-testid="bulk-issue-btn">
                {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <FileCheck2 data-icon="inline-start" />}
                Έκδοση ({drafts})
              </Button>
            ) : null}
            {canWrite && payable > 0 ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run("mark_paid", `Καταχώριση πλήρους εξόφλησης σε ${payable} παραστατικά;`)} data-testid="bulk-paid-btn">
                <BadgeEuro data-icon="inline-start" /> Εξόφληση ({payable})
              </Button>
            ) : null}
            {canWrite ? (
              <Button size="sm" variant="outline" data-testid="bulk-transmit-btn" disabled={pending || transmittable === 0} onClick={() => run("transmit", mock ? undefined : `Διαβίβαση ${transmittable} παραστατικών στο myDATA (παραγωγή);`)} title={transmittable === 0 ? "Κανένα επιλέξιμο για διαβίβαση (εκδοθέν, χωρίς MARK)" : undefined}>
                {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                myDATA ({transmittable})
              </Button>
            ) : null}
            {canWrite ? (
              <Button size="sm" variant="outline" data-testid="bulk-email-btn" disabled={pending || emailable === 0} onClick={() => run("email", `Αποστολή ${emailable} παραστατικών με email στους πελάτες;`)}>
                <Mail data-icon="inline-start" /> Email ({emailable})
              </Button>
            ) : null}
            <Button size="sm" variant="outline" data-testid="bulk-download-pdf" disabled={pending} onClick={() => download("zip")}>
              <Download data-icon="inline-start" /> PDF (ZIP)
            </Button>
            <Button size="sm" variant="outline" data-testid="bulk-download-csv" disabled={pending} onClick={() => download("csv")}>
              <FileSpreadsheet data-icon="inline-start" /> CSV
            </Button>
            {canWrite && drafts > 0 ? (
              <Button size="sm" variant="outline" data-testid="bulk-delete-drafts" className="text-destructive" disabled={pending} onClick={() => run("delete_drafts", `Οριστική διαγραφή ${drafts} πρόχειρων παραστατικών;`)}>
                <Trash2 data-icon="inline-start" /> Διαγραφή προχείρων ({drafts})
              </Button>
            ) : null}
          </div>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())} data-testid="bulk-clear-selection" aria-label="Αποεπιλογή">
            <X data-icon="inline-start" /> Αποεπιλογή
          </Button>
        </div>
      ) : null}
      <Table className="table-fixed sm:table-auto" data-testid="invoices-table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allSelected ? true : someSelected ? "indeterminate" : false} onCheckedChange={(v) => toggleAll(v === true)} data-testid="invoice-select-all" aria-label="Επιλογή όλων" />
            </TableHead>
            <TableHead>Αριθμός</TableHead>
            <TableHead className="hidden sm:table-cell">Πελάτης</TableHead>
            <TableHead className="hidden md:table-cell">Έκδοση</TableHead>
            <TableHead className="hidden lg:table-cell">Προθεσμία</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Καθαρό</TableHead>
            <TableHead className="w-[44%] text-right sm:w-auto">Σύνολο</TableHead>
            <TableHead className="hidden sm:table-cell">Κατάσταση</TableHead>
            <TableHead className="hidden md:table-cell">myDATA</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((inv) => {
            const dt = getDocumentType(inv.invoiceType);
            const overdue = !dt.credit && !dt.expenseSide && dt.kind === "invoice" && inv.dueDate && (inv.status === "issued" || inv.status === "partially_paid") && inv.totalGrossValue - inv.paidAmount > 0.005 && inv.dueDate < businessDate();
            const isSelected = selected.has(inv.id);
            return (
              <TableRow key={inv.id} data-state={isSelected ? "selected" : undefined} className={isSelected ? "bg-muted/50" : undefined}>
                <TableCell>
                  <Checkbox checked={isSelected} onCheckedChange={(v) => toggle(inv.id, v === true)} data-testid={`invoice-select-${inv.id}`} aria-label={`Επιλογή ${inv.displayNumber}`} />
                </TableCell>
                <TableCell className="min-w-0">
                  <Link href={`/invoices/${inv.id}`} className="block truncate font-medium hover:underline" title={inv.displayNumber} data-testid={`invoice-open-${inv.id}`}>
                    {inv.displayNumber}
                  </Link>
                  <div className="mt-1 truncate text-xs sm:hidden" title={inv.customerName || "Λιανική"} data-testid={`invoice-mobile-customer-${inv.id}`}>{inv.customerName || "Λιανική"}</div>
                  <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span>
                      {dt.short} · {dt.code}
                    </span>
                    {inv.emailedAt ? <Mail className="size-3" aria-label="Στάλθηκε με email" /> : null}
                    {inv.viewedAt ? <Eye className="size-3 text-emerald-600" aria-label={`Προβλήθηκε από τον πελάτη ${new Date(inv.viewedAt).toLocaleString("el-GR")}`} /> : null}
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-[220px] sm:table-cell">
                  <div className="truncate">{inv.customerName || <span className="text-muted-foreground">Λιανική</span>}</div>
                  {inv.tags?.length ? <TagList tags={inv.tags} max={2} /> : null}
                </TableCell>
                <TableCell className="hidden md:table-cell">{formatDate(inv.issueDate)}</TableCell>
                <TableCell className={cn("hidden lg:table-cell", overdue ? "font-medium text-red-600" : "")}>{inv.dueDate ? formatDate(inv.dueDate) : "—"}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell" data-testid={`invoice-net-${inv.id}`}>{formatMoney((dt.credit ? -1 : 1) * inv.totalNetValue, inv.currency)}</TableCell>
                <TableCell className={cn("text-right tabular-nums whitespace-normal break-words sm:whitespace-nowrap", dt.credit ? "text-red-700" : "")}>
                  <span className="break-all sm:break-normal" data-testid={`invoice-total-${inv.id}`}>{formatMoney((dt.credit ? -1 : 1) * inv.totalGrossValue, inv.currency)}</span>
                  {inv.status === "partially_paid" ? <div className="text-xs font-normal text-amber-700">Υπόλοιπο {formatMoney(inv.totalGrossValue - inv.paidAmount, inv.currency)}</div> : null}
                  <div className="mt-1 sm:hidden" data-testid={`invoice-mobile-status-${inv.id}`}><InvoiceStatusBadge status={inv.status} /></div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <InvoiceStatusBadge status={inv.status} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {inv.status === "draft" ? <span className="text-xs text-muted-foreground">—</span> : <MyDataStatusBadge status={inv.mydataStatus} mark={inv.mydataMark} />}
                  {inv.b2gStatus && inv.b2gStatus !== "not_sent" ? (
                    <div className="mt-1">
                      <Badge
                        variant={inv.b2gStatus === "rejected" || inv.b2gStatus === "error" ? "destructive" : "outline"}
                        className={cn("text-[10px]", inv.b2gStatus === "accepted" ? "border-emerald-600 text-emerald-700" : "")}
                        data-testid={`b2g-badge-${inv.id}`}
                      >
                        Δημόσιο: {B2G_STATUS_LABELS[inv.b2gStatus] ?? inv.b2gStatus}
                      </Badge>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
