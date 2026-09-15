import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm } from "@/lib/services/firm";
import { buildBridgeDataset, buildProgramExport, datasetToCsv, type BridgeProviderId, type BridgeEntity } from "@/lib/accounting-bridge";

export const dynamic = "force-dynamic";

function yearRange(url: URL) {
  const y = new Date().getFullYear();
  return {
    from: url.searchParams.get("from") || `${y}-01-01`,
    to: url.searchParams.get("to") || `${y}-12-31`,
  };
}

export async function GET(req: Request) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const orgId = url.searchParams.get("org");
  if (!orgId) return new Response("Missing org", { status: 400 });
  const firm = await resolveFirm(db, user.id);
  if (!firm) return new Response("Forbidden", { status: 403 });
  const client = await firmClient(db, firm, orgId);
  if (!client) return new Response("Forbidden", { status: 403 });

  const { from, to } = yearRange(url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const ds = await buildBridgeDataset(db, client.org, from, to);
  const base = `bridge_${client.org.afm || client.org.id.slice(0, 8)}_${from}_${to}`;

  const provider = url.searchParams.get("provider");
  if (provider && ["softone", "epsilon", "generic"].includes(provider)) {
    const ent = url.searchParams.get("entities");
    if (ent !== null && !ent.trim()) return new Response("Δεν επιλέχθηκε καμία οντότητα για εξαγωγή.", { status: 400 });
    const set = ent ? new Set(ent.split(",") as BridgeEntity[]) : undefined;
    const out = await buildProgramExport(provider as BridgeProviderId, ds, set);
    return new Response(out.body as BodyInit, { headers: { "Content-Type": out.mime, "Content-Disposition": `attachment; filename="${out.filename}"` } });
  }

  if (format === "csv") {
    return new Response(datasetToCsv(ds), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` },
    });
  }
  return new Response(JSON.stringify(ds, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.json"` },
  });
}
