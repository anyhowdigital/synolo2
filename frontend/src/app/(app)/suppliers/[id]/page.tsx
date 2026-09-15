import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Landmark,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import {
  expenseDueDate,
  expenseRemaining,
  getSupplier,
  listExpensePayments,
  payablesAging,
} from "@/lib/services/suppliers";
import { listAccounts } from "@/lib/services/banking";
import { listExpensesWithLines } from "@/lib/services/expenses";
import { collectTags } from "@/lib/services/dimensions";
import { defsFor, parseTags } from "@/lib/services/custom-fields";
import {
  EXPENSE_CLASSIFICATION_CATEGORIES,
  EXPENSE_CLASSIFICATION_TYPES,
} from "@/lib/services/expense-labels";
import { PAYMENT_METHODS } from "@/lib/greek/document-types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { ExpenseStatusBadge } from "@/components/status-badge";
import { TagList } from "@/components/tags/tag-input";
import {
  DeleteSupplierButton,
  SupplierDialog,
} from "@/components/suppliers/supplier-dialog";
import {
  DeletePaymentButton,
  ExpensePaymentDialog,
} from "@/components/suppliers/payment-dialog";
import { PayablesAgingCard } from "@/components/suppliers/aging-card";
import { ExpenseDialog } from "@/components/expenses/expenses-ui";
import { cn } from "@/lib/utils";

export default async function SupplierDetailPage({
  params,
}: PageProps<"/suppliers/[id]">) {
  const { id } = await params;
  const db = await getDb();
  const { org, role } = await requireContext(db);
  const canWrite = can(role, "write");
  const supplier = await getSupplier(db, org.id, id);
  if (!supplier) notFound();

  const [rows, aging, tagSuggestions, expenseTags, accountRows] = await Promise.all([
    listExpensesWithLines(db, org.id, { supplierId: id }),
    payablesAging(db, org.id, { supplierId: id }),
    collectTags(db, org.id, "supplier"),
    collectTags(db, org.id, "expense"),
    listAccounts(db, org.id),
  ]);
  const accounts = accountRows.map((a) => ({ id: a.id, name: a.name, kind: a.kind, isDefault: a.isDefault }));
  const payments = await listExpensePayments(
    db,
    org.id,
    rows.map((r) => r.id),
  );
  const active = rows.filter((e) => e.status !== "rejected");
  const purchased = active.reduce((s, e) => s + e.grossValue, 0);
  const paid = active.reduce((s, e) => s + e.paidAmount, 0);
  const today = new Date().toISOString().slice(0, 10);
  const expenseById = new Map(rows.map((r) => [r.id, r]));
  const extras = {
    defs: defsFor(org.customFieldDefsJson, "expense"),
    tagSuggestions: expenseTags,
    suppliers: [supplier],
    accounts,
  };
  const categoryLabel = supplier.defaultClassificationCategory
    ? (EXPENSE_CLASSIFICATION_CATEGORIES.find(
        (c) => c.code === supplier.defaultClassificationCategory,
      )?.label ?? supplier.defaultClassificationCategory)
    : null;
  const typeLabel = supplier.defaultClassificationType
    ? (EXPENSE_CLASSIFICATION_TYPES.find(
        (c) => c.code === supplier.defaultClassificationType,
      )?.label ?? supplier.defaultClassificationType)
    : null;

  return (
    <>
      <PageHeader
        title={supplier.name}
        description={
          [
            supplier.afm ? `ΑΦΜ ${supplier.afm}` : null,
            supplier.doy ? `ΔΟΥ ${supplier.doy}` : null,
            supplier.country !== "GR" ? supplier.country : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Προμηθευτής"
        }
      >
        {!supplier.active ? <Badge variant="outline">Ανενεργός</Badge> : null}
        <Button asChild variant="ghost">
          <Link href="/suppliers">
            <ArrowLeft data-icon="inline-start" /> Προμηθευτές
          </Link>
        </Button>
        {canWrite ? (
          <>
            <ExpenseDialog extras={extras} defaultSupplierId={supplier.id} />
            <SupplierDialog
              supplier={supplier}
              tagSuggestions={tagSuggestions}
            />
            <DeleteSupplierButton
              id={supplier.id}
              hasExpenses={rows.length > 0}
            />
          </>
        ) : null}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Σύνολο αγορών</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMoney(purchased)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {active.length} παραστατικά
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Πληρωμένα</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMoney(paid)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {payments.length} πληρωμές
          </CardContent>
        </Card>
        <Card className={aging.open > 0 ? "border-amber-300" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Ανοιχτό υπόλοιπο</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMoney(aging.open)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {aging.count} ανοιχτά τιμολόγια
          </CardContent>
        </Card>
        <Card className={aging.overdue > 0 ? "border-red-300" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Ληξιπρόθεσμα</CardDescription>
            <CardTitle
              className={cn(
                "text-2xl tabular-nums",
                aging.overdue > 0 ? "text-red-700" : "",
              )}
            >
              {formatMoney(aging.overdue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {aging.overdueCount > 0
              ? `${aging.overdueCount} μετά την προθεσμία`
              : "Κανένα σε καθυστέρηση."}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <PayablesAgingCard
            aging={aging}
            title="Ενηλικίωση υπολοίπου προμηθευτή"
            compact
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Τιμολόγια αγορών</CardTitle>
              <CardDescription>
                Όλα τα παραστατικά του προμηθευτή, με προθεσμία και ανοιχτό
                υπόλοιπο. Καταχωρήστε πληρωμές (και μερικές) από το εικονίδιο.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Δεν υπάρχουν παραστατικά. Τα παραστατικά με ΑΦΜ{" "}
                  {supplier.afm || "του προμηθευτή"} που θα έρθουν από το myDATA
                  θα συνδεθούν αυτόματα.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ημερομηνία</TableHead>
                      <TableHead>Παραστατικό</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Προθεσμία
                      </TableHead>
                      <TableHead className="text-right">Σύνολο</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">
                        Υπόλοιπο
                      </TableHead>
                      <TableHead>Κατάσταση</TableHead>
                      {canWrite ? <TableHead className="w-24" /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((e) => {
                      const remaining = expenseRemaining(e);
                      const due = expenseDueDate(e);
                      const overdue = remaining > 0 && due < today;
                      return (
                        <TableRow key={e.id}>
                          <TableCell>{formatDate(e.issueDate)}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {e.invoiceType} {e.series ? `${e.series}-` : ""}
                              {e.number || "—"}
                            </div>
                            <div className="max-w-[260px] truncate text-xs text-muted-foreground">
                              {e.description ||
                                (e.mark ? `MARK ${e.mark}` : "χειροκίνητο")}
                            </div>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "hidden text-sm md:table-cell",
                              overdue ? "font-medium text-red-700" : "",
                            )}
                          >
                            {e.dueDate ? (
                              formatDate(e.dueDate)
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(e.grossValue)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "hidden text-right tabular-nums sm:table-cell",
                              remaining > 0
                                ? "font-medium text-amber-700"
                                : "text-muted-foreground",
                            )}
                          >
                            {formatMoney(remaining)}
                          </TableCell>
                          <TableCell>
                            <ExpenseStatusBadge status={e.status} />
                            {e.paidAmount > 0 && remaining > 0 ? (
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                μερικώς {formatMoney(e.paidAmount)}
                              </div>
                            ) : null}
                          </TableCell>
                          {canWrite ? (
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <ExpenseDialog expense={e} extras={extras} />
                                <ExpensePaymentDialog expense={e} accounts={accounts} />
                              </div>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ιστορικό πληρωμών</CardTitle>
              <CardDescription>
                Πληρωμές προς τον προμηθευτή ανά παραστατικό.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {payments.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Δεν έχουν καταχωρηθεί πληρωμές.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ημερομηνία</TableHead>
                      <TableHead>Παραστατικό</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Τρόπος
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Αναφορά
                      </TableHead>
                      <TableHead className="text-right">Ποσό</TableHead>
                      {canWrite ? <TableHead className="w-12" /> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => {
                      const e = expenseById.get(p.expenseId);
                      return (
                        <TableRow key={p.id}>
                          <TableCell>{formatDate(p.paidAt)}</TableCell>
                          <TableCell className="text-sm">
                            {e
                              ? `${e.invoiceType} ${e.series ? `${e.series}-` : ""}${e.number || ""}`.trim()
                              : "—"}
                          </TableCell>
                          <TableCell className="hidden text-sm md:table-cell">
                            {PAYMENT_METHODS.find((m) => m.code === p.method)
                              ?.label ?? p.method}
                          </TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                            {p.reference || "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatMoney(p.amount)}
                          </TableCell>
                          {canWrite ? (
                            <TableCell>
                              <DeletePaymentButton id={p.id} />
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Στοιχεία</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {supplier.contactPerson ? (
                <div className="flex items-start gap-2">
                  <User className="mt-0.5 size-4 text-muted-foreground" />{" "}
                  {supplier.contactPerson}
                </div>
              ) : null}
              {supplier.email ? (
                <div className="flex items-start gap-2">
                  <Mail className="mt-0.5 size-4 text-muted-foreground" />
                  <a
                    href={`mailto:${supplier.email}`}
                    className="hover:underline"
                  >
                    {supplier.email}
                  </a>
                </div>
              ) : null}
              {supplier.phone ? (
                <div className="flex items-start gap-2">
                  <Phone className="mt-0.5 size-4 text-muted-foreground" />{" "}
                  {supplier.phone}
                </div>
              ) : null}
              {supplier.address || supplier.city ? (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 text-muted-foreground" />
                  <span>
                    {supplier.address}
                    {supplier.address && (supplier.city || supplier.postalCode)
                      ? ", "
                      : ""}
                    {[supplier.postalCode, supplier.city]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                </div>
              ) : null}
              {supplier.iban ? (
                <div className="flex items-start gap-2">
                  <Landmark className="mt-0.5 size-4 text-muted-foreground" />
                  <span>
                    <span className="font-mono text-xs">{supplier.iban}</span>
                    {supplier.bankName ? (
                      <span className="block text-xs text-muted-foreground">
                        {supplier.bankName}
                      </span>
                    ) : null}
                  </span>
                </div>
              ) : null}
              <div className="flex items-start gap-2">
                <Banknote className="mt-0.5 size-4 text-muted-foreground" />
                <span>
                  {supplier.paymentTermsDays == null
                    ? "Χωρίς ορισμένους όρους πληρωμής"
                    : supplier.paymentTermsDays === 0
                      ? "Πληρωμή μετρητοίς"
                      : `Πίστωση ${supplier.paymentTermsDays} ημερών`}
                </span>
              </div>
              {!supplier.contactPerson &&
              !supplier.email &&
              !supplier.phone &&
              !supplier.address &&
              !supplier.iban ? (
                <p className="text-xs text-muted-foreground">
                  Δεν έχουν καταχωρηθεί στοιχεία επικοινωνίας.
                </p>
              ) : null}
              <TagList tags={parseTags(supplier.tags)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Προεπιλεγμένος χαρακτηρισμός
              </CardTitle>
              <CardDescription>
                Εφαρμόζεται αυτόματα στα παραστατικά που έρχονται από το myDATA.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {categoryLabel || typeLabel ? (
                <>
                  <div>{categoryLabel ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {supplier.defaultClassificationType}{" "}
                    {typeLabel ? `– ${typeLabel}` : ""}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Δεν έχει οριστεί. Ορίστε κατηγορία και τύπο Ε3 στην
                  επεξεργασία για να χαρακτηρίζονται αυτόματα τα έξοδα.
                </p>
              )}
            </CardContent>
          </Card>

          {supplier.notes ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Σημειώσεις</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">
                {supplier.notes}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
