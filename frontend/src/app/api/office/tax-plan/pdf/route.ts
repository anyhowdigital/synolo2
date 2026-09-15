import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm } from "@/lib/services/firm";
import { taxAdvisor } from "@/lib/services/tax-advisor";
import { taxForecast, yearEndPlan } from "@/lib/tax/engine";
import { renderTaxPlanPdf, taxPlanPdfFilename } from "@/lib/pdf/tax-plan-pdf";
import { registerDocument } from "@/lib/services/doc-registry";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("org") ?? "";
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const firm = await resolveFirm(db, user.id);
  if (!firm) return new Response("Forbidden", { status: 403 });
  const client = await firmClient(db, firm, orgId);
  if (!client) return new Response("Forbidden", { status: 403 });

  const org = client.org;
  const { profile, financials, opportunities, totalBenefit } = await taxAdvisor(db, org);
  const forecast = taxForecast(profile, financials);
  const yearEnd = yearEndPlan(profile, financials);

  const buffer = await renderTaxPlanPdf({
    org,
    data: {
      year: financials.year,
      opportunities,
      totalBenefit,
      forecast,
      yearEnd,
      preparedByName: user.name,
      firmName: firm.firmName,
    },
  });

  const fileName = taxPlanPdfFilename(org, financials.year);
  const reg = await registerDocument(db, {
    orgId: org.id,
    kind: "tax_plan",
    title: `Φορολογικό πλάνο ${financials.year}`,
    period: String(financials.year),
    fileName,
    bytes: buffer,
    userId: user.id,
    userName: user.name,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Document-Code": reg.code,
      "X-Document-Hash": reg.hash,
    },
  });
}
