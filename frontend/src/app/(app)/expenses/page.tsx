import Link from "next/link";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import {
  inputVatSummary,
  listExpenses,
  listExpensesWithLines,
} from "@/lib/services/expenses";
import {
  expenseDueDate,
  expenseRemaining,
  listSuppliers,
  payablesAging,
} from "@/lib/services/suppliers";
import { listWarehouses } from "@/lib/services/inventory";
import { listAccounts } from "@/lib/services/banking";
import { asc, eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { EXPENSE_CLASSIFICATION_CATEGORIES } from "@/lib/services/expense-labels";
import { quarterPeriod } from "@/lib/services/reports";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import { can } from "@/lib/auth/session";
import { EmptyState, PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/list/filter-bar";
import { ListPagination } from "@/components/list/list-pagination";
import { paginate, parsePage, parsePageSize } from "@/lib/list-params";
import { AdvisorInsight } from "@/components/advisor/advisor-insight";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExpenseStatusBadge } from "@/components/status-badge";
import {
  ExpenseDialog,
  ExpenseRowActions,
  SendClassificationsButton,
  SyncExpensesButton,
} from "@/components/expenses/expenses-ui";
import { cn } from "@/lib/utils";
import { TagList } from "@/components/tags/tag-input";
import { defsFor, parseTags } from "@/lib/services/custom-fields";
import { collectTags } from "@/lib/services/dimensions";
import { OcrUploader } from "@/components/expenses/ocr-uploader";
import { ImportDialog } from "@/components/import-dialog";

export const metadata = { title: "Έξοδα" };

const FILTERS = [
  { key: "", label: "Όλα" },
  { key: "pending", label: "Προς χαρακτηρισμό" },
  { key: "classified", label: "Χαρακτηρισμένα" },
  { key: "open", label: "Ανεξόφλητα" },
  { key: "overdue", label: "Ληξιπρόθεσμα" },
  { key: "paid", label: "Εξοφλημένα" },
];

export default async function ExpensesPage({
  searchParams,
}: PageProps<"/expenses">) {
  const sp = await searchParams;
  const def = quarterPeriod();
  const period = {
    from:
      typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)
        ? sp.from
        : def.from,
    to:
      typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)
        ? sp.to
        : def.to,
  };
  const status = typeof sp.status === "string" ? sp.status : "";
  const db = await getDb();
  const { org, role } = await requireContext(db);
  const canWrite = can(role, "write");
  const supplierId = typeof sp.supplier === "string" ? sp.supplier : "";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const pageSize = parsePageSize(sp.pageSize);
  const [allRows, summary, allInPeriod, tagSuggestions, supplierList, aging, productRows, warehouseRows, accountRows] =
    await Promise.all([
      listExpensesWithLines(db, org.id, {
        ...period,
        status,
        supplierId: supplierId || undefined,
      }),
      inputVatSummary(db, org.id, period),
      status ? listExpenses(db, org.id, { ...period, status: "" }) : null,
      collectTags(db, org.id, "expense"),
      listSuppliers(db, org.id),
      payablesAging(db, org.id),
      db
        .select({ id: products.id, name: products.name, sku: products.sku, costPrice: products.costPrice, avgCost: products.avgCost, vatCategory: products.vatCategory, trackStock: products.trackStock })
        .from(products)
        .where(eq(products.orgId, org.id))
        .orderBy(asc(products.name)),
      listWarehouses(db, org.id),
      listAccounts(db, org.id),
    ]);
  const today = new Date().toISOString().slice(0, 10);
  const supplierById = new Map(supplierList.map((s) => [s.id, s]));
  const extras = {
    defs: defsFor(org.customFieldDefsJson, "expense"),
    tagSuggestions,
    suppliers: supplierList.map((s) => ({
      id: s.id,
      name: s.name,
      afm: s.afm,
      country: s.country,
      paymentTermsDays: s.paymentTermsDays,
      defaultClassificationCategory: s.defaultClassificationCategory,
      defaultClassificationType: s.defaultClassificationType,
    })),
    products: productRows,
    warehouses: warehouseRows.map((w) => ({ id: w.id, name: w.name, isDefault: w.isDefault })),
    accounts: accountRows.map((a) => ({ id: a.id, name: a.name, kind: a.kind, isDefault: a.isDefault })),
  };
  const pendingClassificationSend = (allInPeriod ?? allRows).filter(
    (e) =>
      e.mark &&
      e.classificationCategory &&
      e.classificationType &&
      !e.classificationSentAt,
  ).length;
  const searched = q ? allRows.filter((e) => [e.supplierName, e.supplierAfm, e.number, e.series, e.mark, e.description].some((v) => String(v ?? "").toLowerCase().includes(q))) : allRows;
  const paged = paginate(searched, parsePage(sp.page), pageSize);
  const rows = paged.rows;
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({
      from: period.from,
      to: period.to,
      ...(status ? { status } : {}),
      ...(supplierId ? { supplier: supplierId } : {}),
      ...(q ? { q } : {}),
      ...(pageSize !== 25 ? { pageSize: String(pageSize) } : {}),
      ...patch,
    });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/expenses?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Έξοδα & Αγορές"
        description="Τιμολόγια αγορών από το myDATA (RequestDocs) ή χειροκίνητα, με χαρακτηρισμό εξόδων για Ε3, ΦΠΑ εισροών, προθεσμίες και πληρωμές προμηθευτών."
      >
        {canWrite ? (
          <>
            <SyncExpensesButton
              from={period.from}
              to={period.to}
              mock={org.mydataEnvironment === "mock"}
            />
            <SendClassificationsButton
              from={period.from}
              to={period.to}
              count={pendingClassificationSend}
              mock={org.mydataEnvironment === "mock"}
            />
            <ExpenseDialog extras={extras} />
            <ImportDialog kind="expenses" />
          </>
        ) : null}
      </PageHeader>

      <AdvisorInsight org={org} />

      {canWrite ? (
        <div className="mb-6 space-y-3">
          <OcrUploader />
          <div className="rounded-xl border bg-card p-4 text-sm">
            Πολλές αποδείξεις μαζί;{" "}
            <Link href="/expenses/ocr" className="font-medium underline underline-offset-2" data-testid="bulk-ocr-link">
              Μαζικό OCR (έως 30 αρχεία)
            </Link>{" "}
            — το AI τις καταχωρεί ως προσχέδια με προμηθευτή, ΑΦΜ, ΦΠΑ και προτεινόμενο χαρακτηρισμό.
          </div>
        </div>
      ) : null}

      <FilterBar
        action="/expenses"
        q={q}
        from={period.from}
        to={period.to}
        searchPlaceholder="Αναζήτηση: προμηθευτής, ΑΦΜ, αριθμός, ΜΑΡΚ…"
        hidden={{ status, supplier: supplierId, pageSize: pageSize === 25 ? "" : String(pageSize) }}
        clearHref="/expenses"
        chips={[
          ...FILTERS.map((f) => ({ key: f.key, label: f.label, href: href({ status: f.key, page: "" }), active: status === f.key })),
          ...(supplierId ? [{ key: "supplier", label: `Προμηθευτής: ${supplierById.get(supplierId)?.name ?? "—"} ×`, href: href({ supplier: "" }), active: true }] : []),
        ]}
      />
      <p className="-mt-2 mb-4 text-xs text-muted-foreground">Προεπιλογή περιόδου: τρέχον τρίμηνο. Η «Λήψη από myDATA» φέρνει τα παραστατικά των προμηθευτών για την επιλεγμένη περίοδο.</p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Καθαρές δαπάνες περιόδου</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMoney(summary.net)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {summary.count} παραστατικά
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ΦΠΑ εισροών (εκπιπτόμενος)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMoney(summary.vat)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {summary.nonDeductible > 0
              ? `+ ${formatMoney(summary.nonDeductible)} χωρίς δικαίωμα έκπτωσης`
              : "Συμψηφίζεται με τον ΦΠΑ εκροών στις Αναφορές."}
          </CardContent>
        </Card>
        <Card className={summary.pending > 0 ? "border-amber-300" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Προς χαρακτηρισμό</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary.pending}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Ο χαρακτηρισμός εξόδων απαιτείται για τη διαβίβαση στο myDATA από
            τον λογιστή.
          </CardContent>
        </Card>
        <Card className={aging.overdue > 0 ? "border-red-300" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Ανοιχτά πληρωτέα (σύνολο)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMoney(aging.open)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {aging.overdue > 0 ? (
              <span className="text-red-700">
                {formatMoney(aging.overdue)} ληξιπρόθεσμα
              </span>
            ) : (
              "Κανένα ληξιπρόθεσμο."
            )}
            {" · "}
            <Link
              href="/suppliers"
              className="underline-offset-2 hover:underline"
            >
              Προμηθευτές & aging
            </Link>
          </CardContent>
        </Card>
      </div>


      {rows.length === 0 ? (
        <EmptyState
          title="Δεν υπάρχουν έξοδα στην περίοδο"
          description="Πατήστε «Λήψη από myDATA» για να φέρετε τα παραστατικά των προμηθευτών σας ή καταχωρήστε χειροκίνητα."
          action={canWrite ? <ExpenseDialog extras={extras} /> : undefined}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ημερομηνία</TableHead>
                <TableHead>Προμηθευτής</TableHead>
                <TableHead className="hidden md:table-cell">
                  Παραστατικό
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  Χαρακτηρισμός
                </TableHead>
                <TableHead className="hidden xl:table-cell">
                  Προθεσμία
                </TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Καθαρό
                </TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  ΦΠΑ
                </TableHead>
                <TableHead className="text-right">Σύνολο</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  Υπόλοιπο
                </TableHead>
                <TableHead>Κατάσταση</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => {
                const remaining = expenseRemaining(e);
                const overdue = remaining > 0 && expenseDueDate(e) < today;
                return (
                  <TableRow key={e.id}>
                    <TableCell>{formatDate(e.issueDate)}</TableCell>
                    <TableCell>
                      <div className="max-w-[220px] truncate font-medium">
                        {e.supplierId ? (
                          <Link
                            href={`/suppliers/${e.supplierId}`}
                            className="hover:underline"
                          >
                            {e.supplierName}
                          </Link>
                        ) : (
                          e.supplierName
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {e.supplierAfm ? `ΑΦΜ ${e.supplierAfm}` : ""}
                        {e.description ? ` · ${e.description}` : ""}
                        {e.lines.length ? ` · ${e.lines.length} γραμμές` : ""}
                      </div>
                      <TagList tags={parseTags(e.tags)} max={3} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="text-sm">
                        {e.invoiceType} {e.series ? `${e.series}-` : ""}
                        {e.number}
                      </div>
                      {e.mark ? (
                        <div className="font-mono text-xs text-muted-foreground">
                          MARK {e.mark}
                        </div>
                      ) : (
                        <Badge variant="outline">χειροκίνητο</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-xs lg:table-cell">
                      {e.classificationCategory ? (
                        <>
                          <div>
                            {EXPENSE_CLASSIFICATION_CATEGORIES.find(
                              (c) => c.code === e.classificationCategory,
                            )?.label ?? e.classificationCategory}
                          </div>
                          <div className="text-muted-foreground">
                            {e.classificationType}
                            {e.mark ? (
                              e.classificationSentAt ? (
                                <span className="ml-1 text-emerald-700">
                                  · διαβιβάστηκε{" "}
                                  {formatDate(
                                    e.classificationSentAt.slice(0, 10),
                                  )}
                                </span>
                              ) : (
                                <span className="ml-1 text-amber-700">
                                  · προς διαβίβαση
                                </span>
                              )
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <span className="text-amber-700">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "hidden text-sm xl:table-cell",
                        overdue ? "font-medium text-red-700" : "",
                      )}
                    >
                      {e.dueDate ? (
                        formatDate(e.dueDate)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatMoney(e.netValue)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "hidden text-right tabular-nums sm:table-cell",
                        e.vatDeductible
                          ? ""
                          : "text-muted-foreground line-through",
                      )}
                    >
                      {formatMoney(e.vatAmount)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(e.grossValue)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "hidden text-right tabular-nums md:table-cell",
                        remaining > 0
                          ? "text-amber-700"
                          : "text-muted-foreground",
                      )}
                    >
                      {e.status === "rejected" ? "—" : formatMoney(remaining)}
                    </TableCell>
                    <TableCell>
                      <ExpenseStatusBadge status={e.status} />
                      {e.paidAmount > 0 && remaining > 0 ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          μερικώς {formatMoney(e.paidAmount)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {canWrite ? (
                        <ExpenseRowActions expense={e} extras={extras} />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ListPagination total={paged.total} page={paged.page} pageSize={pageSize} hrefFor={(p) => href({ page: String(p.page ?? paged.page), pageSize: String(p.pageSize ?? pageSize) })} noun="έξοδα" />
        </div>
      )}
    </>
  );
}
