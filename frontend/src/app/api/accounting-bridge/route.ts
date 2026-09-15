import { getDb } from "@/db";
import { requireContext } from "@/lib/services/org";
import { buildBridgeDataset, buildProgramExport, datasetToCsv, type BridgeProviderId, type BridgeEntity } from "@/lib/accounting-bridge";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = await getDb();
  const { org } = await requireContext(db);
  const url = new URL(req.url);
  const y = new Date().getFullYear();
  const from = url.searchParams.get("from") || `${y}-01-01`;
  const to = url.searchParams.get("to") || `${y}-12-31`;
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const ds = await buildBridgeDataset(db, org, from, to);
  const base = `bridge_${org.afm || org.id.slice(0, 8)}_${from}_${to}`;
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
