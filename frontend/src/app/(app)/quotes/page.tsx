import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { invoiceDisplayNumber, listInvoices } from "@/lib/services/invoices";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import { can } from "@/lib/auth/session";
import { EmptyState, PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/list/filter-bar";
import { ListPagination } from "@/components/list/list-pagination";
import { hrefWith, parsePage, parsePageSize } from "@/lib/list-params";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Προσφορές" };

const FILTERS = [
  { key: "", label: "Όλες" },
  { key: "draft", label: "Πρόχειρες" },
  { key: "issued", label: "Σε αναμονή" },
  { key: "accepted", label: "Αποδεκτές" },
  { key: "converted", label: "Τιμολογημένες" },
  { key: "rejected", label: "Απορριφθείσες" },
];

export default async function QuotesPage({ searchParams }: PageProps<"/quotes">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(sp.from ?? "")) ? String(sp.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(sp.to ?? "")) ? String(sp.to) : "";
  const page = parsePage(sp.page);
  const pageSize = parsePageSize(sp.pageSize);
  const linkFor = (patch: Record<string, string | number | undefined>) => hrefWith("/quotes", { status, q, from, to, pageSize: pageSize === 25 ? "" : pageSize }, patch);
  const db = await getDb();
  const { org, role } = await requireContext(db);
  const canWrite = can(role, "write");
  const result = await listInvoices(db, org.id, { kind: "quote", status, q, from, to, page, pageSize });
  const all = (await listInvoices(db, org.id, { kind: "quote", pageSize: 500 })).rows;

  const pipeline = {
    open: all.filter((q) => q.status === "issued"),
    accepted: all.filter((q) => q.status === "accepted"),
    converted: all.filter((q) => q.status === "converted"),
  };
  const sum = (list: typeof all) => list.reduce((s, q) => s + q.totalGrossValue, 0);
  const decided = pipeline.accepted.length + pipeline.converted.length + all.filter((q) => q.status === "rejected").length;
  const winRate = decided ? Math.round(((pipeline.accepted.length + pipeline.converted.length) / decided) * 100) : null;

  return (
    <>
      <PageHeader title="Προσφορές" description="Προσφορές προς πελάτες με online αποδοχή και μετατροπή σε τιμολόγιο με ένα κλικ. Δεν διαβιβάζονται στο myDATA.">
        {canWrite ? (
          <Button asChild>
            <Link href="/invoices/new?kind=quote">
              <Plus data-icon="inline-start" /> Νέα προσφορά
            </Link>
          </Button>
        ) : null}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Σε αναμονή απάντησης</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(sum(pipeline.open))}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{pipeline.open.length} προσφορές</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Αποδεκτές – προς τιμολόγηση</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatMoney(sum(pipeline.accepted))}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{pipeline.accepted.length} προσφορές</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ποσοστό επιτυχίας</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{winRate === null ? "—" : `${winRate}%`}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{pipeline.converted.length} τιμολογήθηκαν</CardContent>
        </Card>
      </div>

      <FilterBar
        action="/quotes"
        q={q}
        from={from}
        to={to}
        searchPlaceholder="Αναζήτηση: πελάτης, ΑΦΜ, αριθμός…"
        hidden={{ status, pageSize: pageSize === 25 ? "" : String(pageSize) }}
        clearHref={linkFor({ q: "", from: "", to: "" })}
        chips={FILTERS.map((f) => ({ key: f.key, label: f.label, href: linkFor({ status: f.key, page: "" }), active: status === f.key }))}
      />

      {result.rows.length === 0 ? (
        <EmptyState
          title="Δεν υπάρχουν προσφορές"
          description="Δημιουργήστε προσφορά, στείλτε την με email και ο πελάτης την αποδέχεται online. Μετά, μετατρέψτε την σε τιμολόγιο με ένα κλικ."
          action={
            canWrite ? (
              <Button asChild>
                <Link href="/invoices/new?kind=quote">Νέα προσφορά</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Αριθμός</TableHead>
                <TableHead>Πελάτης</TableHead>
                <TableHead className="hidden md:table-cell">Ημερομηνία</TableHead>
                <TableHead className="hidden md:table-cell">Ισχύει έως</TableHead>
                <TableHead className="text-right">Σύνολο</TableHead>
                <TableHead>Κατάσταση</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>
                    <Link href={`/invoices/${q.id}`} className="font-medium hover:underline">
                      {invoiceDisplayNumber(q)}
                    </Link>
                    {q.emailedAt || q.viewedAt ? (
                      <div className="text-xs text-muted-foreground">
                        {q.emailedAt ? `Στάλθηκε ${formatDate(q.emailedAt.slice(0, 10))}` : null}
                        {q.viewedAt ? <span className="text-emerald-700">{q.emailedAt ? " · " : ""}Προβλήθηκε {formatDate(q.viewedAt.slice(0, 10))}</span> : null}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate">{q.customerName}</TableCell>
                  <TableCell className="hidden md:table-cell">{formatDate(q.issueDate)}</TableCell>
                  <TableCell className="hidden md:table-cell">{q.dueDate ? formatDate(q.dueDate) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(q.totalGrossValue, q.currency)}</TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={q.status === "issued" ? "issued" : q.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPagination total={result.total} page={result.page} pageSize={pageSize} hrefFor={(p) => linkFor(p)} noun="προσφορές" />
        </div>
      )}
    </>
  );
}
