import { getDb } from "@/db";
import { PageHeader } from "@/components/page-header";
import { requireContext } from "@/lib/services/org";
import { riskHistory, riskReport, saveRiskSnapshot } from "@/lib/services/risks";
import { RiskList, RiskScore } from "@/components/risks/risk-panel";

export const metadata = { title: "Κίνδυνοι – Radar συμμόρφωσης" };

export default async function RisksPage() {
  const db = await getDb();
  const { org } = await requireContext(db);
  const report = await riskReport(db, org);
  await saveRiskSnapshot(db, org.id, report);
  const history = (await riskHistory(db, org.id, 60)).map((h) => ({ day: h.day, score: h.score }));

  return (
    <>
      <PageHeader
        title="Κίνδυνοι"
        description="Τι θα «χτυπήσει καμπάνα» στην ΑΑΔΕ αν γίνει έλεγχος σήμερα – με λύση βήμα-βήμα από τον AI βοηθό για κάθε εύρημα."
      />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 xl:order-2">
          <div className="xl:sticky xl:top-4">
            <RiskScore report={report} history={history} />
          </div>
        </div>
        <div className="min-w-0 xl:order-1">
          <RiskList report={report} />
        </div>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Το radar ελέγχει διαβίβαση myDATA, αρίθμηση & διπλοεγγραφές, ΦΠΑ/απαλλαγές, στοιχεία αντισυμβαλλομένων, παρακρατήσεις & χαρτόσημο, Φ2/προθεσμίες και ταμείο. Έχει ενημερωτικό χαρακτήρα και δεν
        αντικαθιστά τον λογιστή σας.
      </p>
    </>
  );
}
