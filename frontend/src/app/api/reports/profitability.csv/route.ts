import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { customerProfitability, itemProfitability, projectProfitability } from "@/lib/services/profitability";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const csv = (rows: (string | number)[][]) => "\uFEFF" + rows.map((r) => r.map((c) => (typeof c === "string" && /[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(";")).join("\n");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") ?? "customers";
  const today = new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const period = { from: from && dateRe.test(from) ? from : today.slice(0, 8) + "01", to: to && dateRe.test(to) ? to : today };

  const db = await getDb();
  const { org } = await requireContext(db);

  let body = "";
  if (tab === "projects") {
    const rows = await projectProfitability(db, org.id, period);
    body = csv([["Έργο", "Πελάτης", "Ώρες", "Χρεώσιμες", "Έσοδα", "Τιμολογημένα", "Κόστος", "Κέρδος", "Περιθώριο %"], ...rows.map((p) => [p.name, p.customerName, p.hours, p.billableHours, p.revenue, p.invoiced, p.cost, p.profit, p.marginPercent])]);
  } else if (tab === "items") {
    const rows = await itemProfitability(db, org.id, period);
    body = csv([["Είδος", "Κωδικός", "Ποσότητα", "Πωλήσεις", "Κόστος", "Μεικτό κέρδος", "Περιθώριο %"], ...rows.map((i) => [i.name, i.sku, i.quantity, i.sales, i.cogs, i.grossProfit, i.marginPercent])]);
  } else {
    const rows = await customerProfitability(db, org.id, period);
    body = csv([
      ["Πελάτης", "Πωλήσεις", "Κόστος", "Μεικτό κέρδος", "Περιθώριο %", "Εισπραχθέντα", "Ανεξόφλητα", "Μ.Ο. ημερών πληρωμής", "Παραστατικά"],
      ...rows.map((c) => [c.name, c.sales, c.cogs, c.grossProfit, c.marginPercent, c.collected, c.outstanding, c.avgDaysToPay ?? "", c.invoiceCount]),
    ]);
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="profitability-${tab}-${period.from}_${period.to}.csv"`,
    },
  });
}
