import { customersTemplateCsv, productsTemplateCsv } from "@/lib/import/importers";
import { expensesTemplateCsv, invoicesTemplateCsv, suppliersTemplateCsv } from "@/lib/import/importers-docs";
import { paymentsTemplateCsv } from "@/lib/import/importers-payments";

export const dynamic = "force-dynamic";

const TEMPLATES: Record<string, { csv: () => string; file: string }> = {
  customers: { csv: customersTemplateCsv, file: "protypo_pelates.csv" },
  products: { csv: productsTemplateCsv, file: "protypo_eidi.csv" },
  invoices: { csv: invoicesTemplateCsv, file: "protypo_parastatika.csv" },
  expenses: { csv: expensesTemplateCsv, file: "protypo_exoda.csv" },
  suppliers: { csv: suppliersTemplateCsv, file: "protypo_promitheftes.csv" },
  payments: { csv: paymentsTemplateCsv, file: "protypo_pliromes.csv" },
};

export async function GET(req: Request) {
  const type = new URL(req.url).searchParams.get("type") ?? "";
  const t = TEMPLATES[type];
  if (!t) return new Response("Unknown template", { status: 404 });
  return new Response(t.csv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${t.file}"`,
    },
  });
}
