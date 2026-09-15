import Link from "next/link";
import { and, desc, eq, like, or } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { creditBalancesByCustomer } from "@/lib/services/credits";
import { getDocumentType } from "@/lib/greek/document-types";
import { customers, invoices } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { formatMoney } from "@/lib/invoice/totals";
import { EmptyState, PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/list/filter-bar";
import { ListPagination } from "@/components/list/list-pagination";
import { paginate, parsePage, parsePageSize } from "@/lib/list-params";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StageBadge, STAGE_OPTIONS } from "@/components/status-badge";
import { ImportDialog } from "@/components/import-dialog";
import { cn } from "@/lib/utils";
import { TagList } from "@/components/tags/tag-input";
import { parseTags } from "@/lib/services/custom-fields";
import { collectTags } from "@/lib/services/dimensions";

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const stage = typeof sp.stage === "string" ? sp.stage : "";
  const tag = typeof sp.tag === "string" ? sp.tag.trim() : "";

  const db = await getDb();
  const { org, role } = await requireContext(db);
  const canWrite = can(role, "write");
  const conditions = [eq(customers.orgId, org.id)];
  if (q) conditions.push(or(like(customers.name, `%${q}%`), like(customers.afm, `%${q}%`), like(customers.email, `%${q}%`))!);
  if (stage) conditions.push(eq(customers.stage, stage));

  const allRows = await db.select().from(customers).where(and(...conditions)).orderBy(desc(customers.createdAt));
  const filtered = tag ? allRows.filter((c) => parseTags(c.tags).some((t) => t.toLowerCase() === tag.toLowerCase())) : allRows;
  const pageSize = parsePageSize(sp.pageSize);
  const paged = paginate(filtered, parsePage(sp.page), pageSize);
  const rows = paged.rows;
  const allTags = await collectTags(db, org.id, "customer");
  const linkFor = (params: Record<string, string>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, stage, tag, pageSize: pageSize === 25 ? "" : String(pageSize), ...params })) if (v) u.set(k, v);
    const qs = u.toString();
    return qs ? `/customers?${qs}` : "/customers";
  };
  const [allInvoices, credits] = await Promise.all([db.select().from(invoices).where(eq(invoices.orgId, org.id)), creditBalancesByCustomer(db, org.id)]);
  const balances = new Map<string, { billed: number; outstanding: number }>();
  for (const inv of allInvoices) {
    if (!inv.customerId || inv.status === "draft" || inv.status === "cancelled") continue;
    const dt = getDocumentType(inv.invoiceType);
    if (dt.kind !== "invoice" || dt.expenseSide) continue;
    const sign = dt.credit ? -1 : 1;
    const b = balances.get(inv.customerId) ?? { billed: 0, outstanding: 0 };
    b.billed += sign * inv.totalGrossValue;
    b.outstanding += sign * (inv.totalGrossValue - inv.paidAmount);
    balances.set(inv.customerId, b);
  }

  return (
    <>
      <PageHeader title="Πελάτες" description="Πελατολόγιο, στάδια πωλήσεων, υπόλοιπα και ιστορικό επικοινωνίας.">
        {canWrite ? (
          <>
            <ImportDialog kind="customers" />
            <Button asChild>
              <Link href="/customers/new">
                <Plus data-icon="inline-start" /> Νέος πελάτης
              </Link>
            </Button>
          </>
        ) : null}
      </PageHeader>

      <FilterBar
        action="/customers"
        q={q}
        showDates={false}
        searchPlaceholder="Αναζήτηση επωνυμίας, ΑΦΜ, email…"
        hidden={{ stage, tag, pageSize: pageSize === 25 ? "" : String(pageSize) }}
        clearHref={linkFor({ q: "", stage: "", tag: "" })}
        chips={[{ key: "", label: "Όλοι", href: linkFor({ stage: "" }), active: !stage }, ...STAGE_OPTIONS.map((s) => ({ key: s.value, label: s.label, href: linkFor({ stage: s.value }), active: stage === s.value }))]}
      />
      {allTags.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Ετικέτες:</span>
          {allTags.map((t) => (
            <Link
              key={t}
              href={linkFor({ tag: tag.toLowerCase() === t.toLowerCase() ? "" : t })}
              className={cn("rounded-full border px-2.5 py-0.5", tag.toLowerCase() === t.toLowerCase() ? "bg-foreground text-background" : "hover:bg-muted")}
            >
              {t}
            </Link>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title={q || stage || tag ? "Δεν βρέθηκαν πελάτες" : "Δεν υπάρχουν πελάτες ακόμη"}
          description={q || stage || tag ? "Δοκιμάστε διαφορετικά κριτήρια αναζήτησης." : "Καταχωρήστε τον πρώτο σας πελάτη για να ξεκινήσετε την τιμολόγηση."}
          action={
            canWrite ? (
              <Button asChild>
                <Link href="/customers/new">Νέος πελάτης</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Επωνυμία</TableHead>
                <TableHead className="hidden md:table-cell">ΑΦΜ / ΔΟΥ</TableHead>
                <TableHead className="hidden lg:table-cell">Επικοινωνία</TableHead>
                <TableHead>Στάδιο</TableHead>
                <TableHead className="text-right">Τζίρος</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Υπόλοιπο</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const b = balances.get(c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {c.kind === "individual" ? "Ιδιώτης" : c.activity || "Επιχείρηση"}
                        {c.country !== "GR" ? ` · ${c.country}` : ""}
                      </div>
                      <TagList tags={parseTags(c.tags)} className="mt-1" max={3} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="font-mono text-sm">{c.afm || "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.doy}</div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="text-sm">{c.contactPerson || c.email || "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.contactPerson ? c.email : c.phone}</div>
                    </TableCell>
                    <TableCell>
                      <StageBadge stage={c.stage} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(b?.billed ?? 0)}</TableCell>
                    <TableCell className={cn("hidden text-right tabular-nums sm:table-cell", b && b.outstanding > 0.005 ? "text-amber-700" : "")}>
                      {formatMoney(b?.outstanding ?? 0)}
                      {(credits.get(c.id) ?? 0) > 0.005 ? <div className="text-xs text-emerald-700">πιστωτικό {formatMoney(credits.get(c.id)!)}</div> : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ListPagination total={paged.total} page={paged.page} pageSize={pageSize} hrefFor={(p) => linkFor({ page: String(p.page ?? paged.page), pageSize: String(p.pageSize ?? pageSize) })} noun="πελάτες" />
        </div>
      )}
    </>
  );
}
