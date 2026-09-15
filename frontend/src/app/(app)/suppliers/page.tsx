import Link from "next/link";

import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import {
  listSuppliers,
  payablesAging,
  supplierBalances,
} from "@/lib/services/suppliers";
import { collectTags } from "@/lib/services/dimensions";
import { parseTags } from "@/lib/services/custom-fields";
import { EmptyState, PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/list/filter-bar";
import { ListPagination } from "@/components/list/list-pagination";
import { paginate, parsePage, parsePageSize } from "@/lib/list-params";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TagList } from "@/components/tags/tag-input";
import { SupplierDialog } from "@/components/suppliers/supplier-dialog";
import { ImportDialog } from "@/components/import-dialog";
import { PayablesAgingCard } from "@/components/suppliers/aging-card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Προμηθευτές" };

export default async function SuppliersPage({
  searchParams,
}: PageProps<"/suppliers">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const showInactive = sp.inactive === "1";
  const db = await getDb();
  const { org, role } = await requireContext(db);
  const canWrite = can(role, "write");
  const pageSize = parsePageSize(sp.pageSize);
  const [allRows, balances, aging, tagSuggestions] = await Promise.all([
    listSuppliers(db, org.id, { q, includeInactive: showInactive }),
    supplierBalances(db, org.id),
    payablesAging(db, org.id),
    collectTags(db, org.id, "supplier"),
  ]);
  const paged = paginate(allRows, parsePage(sp.page), pageSize);
  const rows = paged.rows;
  const linkFor = (params: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({
      q,
      inactive: showInactive ? "1" : "",
      pageSize: pageSize === 25 ? "" : String(pageSize),
      ...params,
    }))
      if (v) u.set(k, v);
    const qs = u.toString();
    return qs ? `/suppliers?${qs}` : "/suppliers";
  };

  return (
    <>
      <PageHeader
        title="Προμηθευτές"
        description="Καρτέλες προμηθευτών, όροι πληρωμής, ανοιχτά υπόλοιπα και ενηλικίωση πληρωτέων. Τα τιμολόγια αγορών συνδέονται αυτόματα με βάση το ΑΦΜ."
      >
        {canWrite ? (
          <>
            <ImportDialog kind="suppliers" />
            <SupplierDialog tagSuggestions={tagSuggestions} />
          </>
        ) : null}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ανοιχτά πληρωτέα</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMoney(aging.open)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {aging.count} ανοιχτά τιμολόγια αγορών
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
            {aging.overdueCount > 0 ? (
              <Link
                href="/expenses?status=overdue"
                className="underline-offset-2 hover:underline"
              >
                {aging.overdueCount} τιμολόγια μετά την προθεσμία
              </Link>
            ) : (
              "Κανένα τιμολόγιο σε καθυστέρηση."
            )}
          </CardContent>
        </Card>
        <Card className={aging.dueSoon > 0 ? "border-amber-300" : ""}>
          <CardHeader className="pb-2">
            <CardDescription>Λήγουν σε 7 ημέρες</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMoney(aging.dueSoon)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Προγραμματίστε τις πληρωμές της εβδομάδας.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Προμηθευτές</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {paged.total}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {showInactive
              ? "Συμπεριλαμβάνονται ανενεργοί."
              : "Ενεργές καρτέλες."}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <PayablesAgingCard aging={aging} />
      </div>

      <FilterBar
        action="/suppliers"
        q={q}
        showDates={false}
        searchPlaceholder="Αναζήτηση επωνυμίας, ΑΦΜ, email, πόλης…"
        hidden={{ inactive: showInactive ? "1" : "", pageSize: pageSize === 25 ? "" : String(pageSize) }}
        clearHref={linkFor({ q: "", inactive: "" })}
        chips={[{ key: "active", label: "Ενεργοί", href: linkFor({ inactive: "" }), active: !showInactive }, { key: "inactive", label: "Εμφάνιση ανενεργών", href: linkFor({ inactive: "1" }), active: showInactive }]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={
            q ? "Δεν βρέθηκαν προμηθευτές" : "Δεν υπάρχουν προμηθευτές ακόμη"
          }
          description={
            q
              ? "Δοκιμάστε διαφορετικά κριτήρια αναζήτησης."
              : "Δημιουργήστε καρτέλα προμηθευτή ή ανοίξτε ένα έξοδο και πατήστε «Δημιουργία καρτέλας» – τα παραστατικά με το ίδιο ΑΦΜ συνδέονται αυτόματα."
          }
          action={
            canWrite ? (
              <SupplierDialog tagSuggestions={tagSuggestions} />
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Επωνυμία</TableHead>
                <TableHead className="hidden md:table-cell">
                  ΑΦΜ / ΔΟΥ
                </TableHead>
                <TableHead className="hidden lg:table-cell">Όροι</TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  Αγορές
                </TableHead>
                <TableHead className="text-right">Υπόλοιπο</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Ληξιπρόθεσμο
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const b = balances.get(s.id);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/suppliers/${s.id}`}
                        className="font-medium hover:underline"
                      >
                        {s.name}
                      </Link>
                      {!s.active ? (
                        <Badge variant="outline" className="ml-2">
                          ανενεργός
                        </Badge>
                      ) : null}
                      <div className="text-xs text-muted-foreground">
                        {s.contactPerson || s.email || s.city || "—"}
                        {s.country !== "GR" ? ` · ${s.country}` : ""}
                        {b?.lastPurchaseAt
                          ? ` · τελευταία αγορά ${formatDate(b.lastPurchaseAt)}`
                          : ""}
                      </div>
                      <TagList
                        tags={parseTags(s.tags)}
                        className="mt-1"
                        max={3}
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="font-mono text-sm">{s.afm || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.doy}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">
                      {s.paymentTermsDays == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : s.paymentTermsDays === 0 ? (
                        "Μετρητοίς"
                      ) : (
                        `${s.paymentTermsDays} ημέρες`
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {b ? formatMoney(b.purchased) : "—"}
                      {b ? (
                        <div className="text-xs text-muted-foreground">
                          {b.count} παραστατικά
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        b && b.outstanding > 0.005
                          ? "font-medium text-amber-700"
                          : "",
                      )}
                    >
                      {b ? formatMoney(b.outstanding) : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "hidden text-right tabular-nums sm:table-cell",
                        b && b.overdue > 0.005
                          ? "font-medium text-red-700"
                          : "text-muted-foreground",
                      )}
                    >
                      {b && b.overdue > 0.005 ? formatMoney(b.overdue) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ListPagination total={paged.total} page={paged.page} pageSize={pageSize} hrefFor={(p) => linkFor({ page: String(p.page ?? paged.page), pageSize: String(p.pageSize ?? pageSize) })} noun="προμηθευτές" />
        </div>
      )}
    </>
  );
}
