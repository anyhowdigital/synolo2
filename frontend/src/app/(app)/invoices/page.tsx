import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { series } from "@/db/schema";
import { getDocumentType } from "@/lib/greek/document-types";
import { ImportDialog } from "@/components/import-dialog";
import { CalendarRange, Plus, Tag, X } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { invoiceDisplayNumber, listInvoices } from "@/lib/services/invoices";
import { listPendingTransmissions } from "@/lib/services/mydata-sync";
import { BulkTransmitButton } from "@/components/mydata/mydata-sync-panel";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import { can } from "@/lib/auth/session";
import { EmptyState, PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/list/filter-bar";
import { ListPagination } from "@/components/list/list-pagination";
import { parsePage, parsePageSize } from "@/lib/list-params";
import { Button } from "@/components/ui/button";
import { InvoicesTable } from "@/components/invoices/invoices-table";
import { INVOICE_STATUS_LABELS } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { parseTags } from "@/lib/services/custom-fields";

export const metadata = { title: "Παραστατικά" };

const FILTERS = [
  { key: "", label: "Όλα" },
  { key: "draft", label: "Πρόχειρα" },
  { key: "issued", label: "Εκδοθέντα" },
  { key: "unpaid", label: "Ανεξόφλητα" },
  { key: "overdue", label: "Ληξιπρόθεσμα" },
  { key: "paid", label: "Εξοφλημένα" },
  { key: "cancelled", label: "Ακυρωμένα" },
];

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const sp = await searchParams;
  const status = str(sp.status);
  const mydata = str(sp.mydata);
  const b2g = str(sp.b2g);
  const q = str(sp.q);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(str(sp.from)) ? str(sp.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(str(sp.to)) ? str(sp.to) : "";
  const kind = str(sp.kind) === "delivery" ? "delivery" : "fiscal";
  const tag = str(sp.tag);
  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);

  const db = await getDb();
  const { org, role } = await requireContext(db);
  const canWrite = can(role, "write");
  const [result, pendingTransmissions, seriesRows] = await Promise.all([
    listInvoices(db, org.id, { status, mydata, b2g, q, from, to, kind, tag, page, pageSize }),
    canWrite ? listPendingTransmissions(db, org.id) : Promise.resolve([]),
    db.select({ code: series.code, name: series.name, invoiceType: series.invoiceType }).from(series).where(and(eq(series.orgId, org.id), eq(series.active, true))).orderBy(asc(series.code)),
  ]);
  const importSeriesOptions = seriesRows.filter((s) => !getDocumentType(s.invoiceType).credit && !getDocumentType(s.invoiceType).expenseSide).map((s) => ({ code: s.code, label: `${s.code} – ${s.name} (${s.invoiceType})` }));
  const { rows, totals } = result;

  const buildHref = (patch: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string> = { status, mydata, b2g, q, from, to, tag, kind: kind === "delivery" ? "delivery" : "", page: "", pageSize: pageSize === 25 ? "" : String(pageSize) };
    for (const [k, v] of Object.entries(patch)) merged[k] = v === undefined ? "" : String(v);
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/invoices?${qs}` : "/invoices";
  };

  return (
    <>
      <PageHeader title={kind === "delivery" ? "Δελτία αποστολής" : "Παραστατικά"} description={kind === "delivery" ? "Δελτία αποστολής (9.3) — διακίνηση αγαθών χωρίς αξία. Μετατρέπονται σε τιμολόγιο από την καρτέλα του δελτίου." : "Τιμολόγια, αποδείξεις, πιστωτικά και δελτία αποστολής με κατάσταση διαβίβασης στο myDATA."}>
        {canWrite ? (
          <>
            {pendingTransmissions.length ? <BulkTransmitButton pending={pendingTransmissions.length} mock={org.mydataEnvironment === "mock"} /> : null}
            <ImportDialog kind="invoices" seriesOptions={importSeriesOptions} />
            <Button asChild>
              <Link href="/invoices/new">
                <Plus data-icon="inline-start" /> Νέο παραστατικό
              </Link>
            </Button>
          </>
        ) : null}
      </PageHeader>

      <FilterBar
        action="/invoices"
        q={q}
        from={from}
        to={to}
        searchPlaceholder="Αναζήτηση: πελάτης, ΑΦΜ, αριθμός, MARK…"
        hidden={{ status, kind: kind === "delivery" ? "delivery" : "", mydata, b2g, tag, pageSize: pageSize === 25 ? "" : String(pageSize) }}
        clearHref={buildHref({ q: "", from: "", to: "" })}
        chips={[
          ...FILTERS.map((f) => ({ key: f.key, label: f.label, href: buildHref({ status: f.key, mydata: "", kind: "" }), active: status === f.key && !mydata && kind !== "delivery" })),
          { key: "mydata-pending", label: "Εκκρεμή myDATA", href: buildHref({ mydata: "pending", status: "", kind: "" }), active: mydata === "pending" },
          { key: "delivery", label: "Δελτία αποστολής", href: buildHref({ kind: "delivery", status: "", mydata: "", b2g: "" }), active: kind === "delivery" },
          ...(org.b2gEnabled
            ? [
                { key: "b2g-pending", label: "Εκκρεμή Δημοσίου", href: buildHref({ b2g: "pending", status: "", mydata: "", kind: "" }), active: b2g === "pending" },
                { key: "b2g-rejected", label: "Απορρίψεις Δημοσίου", href: buildHref({ b2g: "rejected", status: "", mydata: "", kind: "" }), active: b2g === "rejected" },
              ]
            : []),
        ]}
      />

      {q || from || to || tag ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Ενεργά φίλτρα:</span>
          {tag ? (
            <Link href={buildHref({ tag: "" })} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary hover:bg-primary/20">
              <Tag className="size-3" /> {tag} <X className="size-3" />
            </Link>
          ) : null}
          {q ? (
            <Link href={buildHref({ q: "" })} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary hover:bg-primary/20">
              «{q}» <X className="size-3" />
            </Link>
          ) : null}
          {from || to ? (
            <Link href={buildHref({ from: "", to: "" })} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary hover:bg-primary/20">
              <CalendarRange className="size-3" /> {from ? formatDate(from) : "…"} – {to ? formatDate(to) : "σήμερα"} <X className="size-3" />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mb-3 flex justify-end">
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {result.total} παραστατικά · Καθαρό {formatMoney(totals.net)} · ΦΠΑ {formatMoney(totals.vat)} · Σύνολο {formatMoney(totals.gross)}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Δεν βρέθηκαν παραστατικά"
          description={status || mydata || q || from || to || tag ? "Δεν υπάρχουν παραστατικά με αυτά τα κριτήρια." : "Εκδώστε το πρώτο σας παραστατικό. Ο αριθμός αποδίδεται αυτόματα από τη σειρά."}
          action={
            canWrite ? (
              <Button asChild>
                <Link href="/invoices/new">Νέο παραστατικό</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="min-w-0">
          <InvoicesTable
            rows={rows.map((inv) => ({
              id: inv.id,
              displayNumber: invoiceDisplayNumber(inv),
              invoiceType: inv.invoiceType,
              customerName: inv.customerName,
              tags: parseTags(inv.tags),
              issueDate: inv.issueDate,
              dueDate: inv.dueDate,
              totalNetValue: inv.totalNetValue,
              totalGrossValue: inv.totalGrossValue,
              paidAmount: inv.paidAmount,
              currency: inv.currency,
              status: inv.status,
              mydataStatus: inv.mydataStatus,
              b2gStatus: inv.b2gStatus,
              mydataMark: inv.mydataMark,
              emailedAt: inv.emailedAt,
              viewedAt: inv.viewedAt,
            }))}
            canWrite={canWrite}
            mock={org.mydataEnvironment === "mock"}
          />
          <ListPagination total={result.total} page={result.page} pageSize={pageSize} hrefFor={(p) => buildHref(p)} noun="παραστατικά" />
        </div>
      )}

      <details className="mt-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Τι σημαίνουν οι καταστάσεις;</summary>
        <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(INVOICE_STATUS_LABELS).map(([key, info]) => (
            <div key={key} className="flex gap-2">
              <dt className={cn("shrink-0 font-medium", info.className)}>{info.label}</dt>
              <dd>{info.help}</dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}
