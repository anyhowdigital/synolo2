import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getCurrentOrg } from "@/lib/services/org";
import { customerStatement } from "@/lib/services/reports";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import { PrintToolbar } from "@/components/invoices/print-toolbar";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/print/customers/[id]/statement">) {
  const { id } = await params;
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const st = await customerStatement(db, org.id, id);
  return { title: st ? `Καρτέλα ${st.customer.name} – ${org.name}` : "Καρτέλα πελάτη" };
}

export default async function CustomerStatementPage({ params, searchParams }: PageProps<"/print/customers/[id]/statement">) {
  const { id } = await params;
  const sp = await searchParams;
  const valid = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const period = { from: valid(sp.from), to: valid(sp.to) };
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const st = await customerStatement(db, org.id, id, period);
  if (!st) notFound();
  const qs = new URLSearchParams();
  if (period.from) qs.set("from", period.from);
  if (period.to) qs.set("to", period.to);
  const c = st.customer;

  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white">
      <PrintToolbar backHref={`/customers/${c.id}`} backLabel="Πίσω στον πελάτη" downloadHref={`/api/customers/${c.id}/statement${qs.size ? `?${qs}` : ""}`} downloadLabel="Λήψη Excel" />
      <div className="mx-auto max-w-[210mm] py-6 print:py-0">
        <article className="min-h-[297mm] bg-white p-[14mm] text-[13px] text-neutral-900 shadow-sm print:shadow-none">
          <header className="flex items-start justify-between gap-6 border-b pb-4">
            <div>
              <div className="text-lg font-semibold">{org.name}</div>
              <div className="text-neutral-600">
                ΑΦΜ {org.afm} · {org.doy}
              </div>
              <div className="text-neutral-600">{[org.address, org.postalCode, org.city].filter(Boolean).join(", ")}</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-semibold tracking-tight">ΚΑΡΤΕΛΑ ΠΕΛΑΤΗ</div>
              <div className="text-neutral-600">
                {period.from || period.to ? `Περίοδος ${period.from ? formatDate(period.from) : "…"} – ${period.to ? formatDate(period.to) : "…"}` : "Όλες οι κινήσεις"}
              </div>
              <div className="text-neutral-600">Εκτύπωση {formatDate(new Date().toISOString().slice(0, 10))}</div>
            </div>
          </header>

          <section className="mt-4 grid grid-cols-2 gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-500">Πελάτης</div>
              <div className="font-semibold">{c.name}</div>
              <div className="text-neutral-600">{c.afm ? `ΑΦΜ ${c.afm}` : ""}{c.doy ? ` · ${c.doy}` : ""}</div>
              <div className="text-neutral-600">{[c.address, c.postalCode, c.city].filter(Boolean).join(", ")}</div>
              {c.email ? <div className="text-neutral-600">{c.email}</div> : null}
            </div>
            <div className="grid grid-cols-3 gap-2 self-start rounded-md border p-3 text-right">
              <div>
                <div className="text-[11px] text-neutral-500">Χρεώσεις</div>
                <div className="font-semibold tabular-nums">{formatMoney(st.totalDebit)}</div>
              </div>
              <div>
                <div className="text-[11px] text-neutral-500">Πιστώσεις</div>
                <div className="font-semibold tabular-nums">{formatMoney(st.totalCredit)}</div>
              </div>
              <div>
                <div className="text-[11px] text-neutral-500">Υπόλοιπο</div>
                <div className={cn("font-semibold tabular-nums", st.closing > 0 ? "text-amber-700" : st.closing < 0 ? "text-emerald-700" : "")}>{formatMoney(st.closing)}</div>
              </div>
            </div>
          </section>

          <table className="mt-6 w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b-2 border-neutral-800 text-left">
                <th className="py-1.5 pr-2">Ημερομηνία</th>
                <th className="py-1.5 pr-2">Παραστατικό</th>
                <th className="py-1.5 pr-2">Περιγραφή</th>
                <th className="py-1.5 pl-2 text-right">Χρέωση</th>
                <th className="py-1.5 pl-2 text-right">Πίστωση</th>
                <th className="py-1.5 pl-2 text-right">Υπόλοιπο</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b text-neutral-500 italic">
                <td className="py-1.5 pr-2">{period.from ? formatDate(period.from) : ""}</td>
                <td className="py-1.5 pr-2"></td>
                <td className="py-1.5 pr-2">Υπόλοιπο από μεταφορά</td>
                <td className="py-1.5 pl-2 text-right"></td>
                <td className="py-1.5 pl-2 text-right"></td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{formatMoney(st.opening)}</td>
              </tr>
              {st.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-neutral-500">
                    Δεν υπάρχουν κινήσεις στην περίοδο.
                  </td>
                </tr>
              ) : (
                st.rows.map((r, i) => (
                  <tr key={i} className="border-b border-neutral-200">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap font-medium">{r.reference}</td>
                    <td className="py-1.5 pr-2">{r.description}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{r.debit ? formatMoney(r.debit) : ""}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{r.credit ? formatMoney(r.credit) : ""}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{formatMoney(r.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-neutral-800 font-semibold">
                <td className="py-2 pr-2" colSpan={3}>
                  Σύνολα περιόδου
                </td>
                <td className="py-2 pl-2 text-right tabular-nums">{formatMoney(st.totalDebit)}</td>
                <td className="py-2 pl-2 text-right tabular-nums">{formatMoney(st.totalCredit)}</td>
                <td className="py-2 pl-2 text-right tabular-nums">{formatMoney(st.closing)}</td>
              </tr>
            </tfoot>
          </table>

          <p className="mt-8 text-[11px] text-neutral-500">
            Θετικό υπόλοιπο = οφειλή του πελάτη προς {org.name}. Οι κινήσεις προκύπτουν από τα εκδοθέντα παραστατικά και τις καταχωρημένες εισπράξεις· τα πιστωτικά τιμολόγια εμφανίζονται ως πιστώσεις.
          </p>
        </article>
      </div>
    </div>
  );
}
