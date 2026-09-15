import path from "node:path";
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Organization } from "@/db/schema";
import type { TaxForecast, YearEndPlanResult } from "@/lib/tax/engine";
import type { DecoratedOpportunity } from "@/lib/services/tax-advisor";

function ensureFonts() {
  delete (Font.getRegisteredFonts() as Record<string, unknown>).NotoSans;
  const dir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "NotoSans",
    fonts: [
      { src: path.join(dir, "NotoSans-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "NotoSans-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}

const s = StyleSheet.create({
  page: { fontFamily: "NotoSans", fontSize: 9, padding: 40, color: "#171717", lineHeight: 1.5 },
  h1: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 11, fontWeight: 700, marginTop: 18, marginBottom: 8 },
  muted: { color: "#525252" },
  small: { fontSize: 7.5, color: "#737373" },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  kpi: { width: "31%", borderWidth: 0.5, borderColor: "#e5e5e5", borderRadius: 6, padding: 8, marginBottom: 8 },
  kpiLabel: { fontSize: 7.5, color: "#525252" },
  kpiValue: { fontSize: 12, fontWeight: 700, marginTop: 2 },
  opp: { borderWidth: 0.5, borderColor: "#e5e5e5", borderRadius: 6, padding: 9, marginBottom: 8 },
  oppHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  oppTitle: { fontWeight: 700, flex: 1, paddingRight: 8 },
  benefit: { fontSize: 9, fontWeight: 700, color: "#15803d" },
  label: { fontWeight: 700, marginTop: 3 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 7, color: "#737373", textAlign: "center" },
});

const SEV: Record<string, { label: string; color: string }> = {
  high: { label: "ΥΨΗΛΗ", color: "#b45309" },
  medium: { label: "ΜΕΣΑΙΑ", color: "#2563eb" },
  info: { label: "ΕΝΗΜΕΡΩΤΙΚΟ", color: "#737373" },
};
const money = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

export interface TaxPlanData {
  year: number;
  opportunities: DecoratedOpportunity[];
  totalBenefit: number;
  forecast: TaxForecast;
  yearEnd: YearEndPlanResult;
  preparedByName: string;
  firmName?: string;
}

export function taxPlanPdfFilename(org: Organization, year: number) {
  const afm = (org.afm || "org").replace(/[^0-9A-Za-z]/g, "");
  return `forologiko-plano-${afm}-${year}.pdf`;
}

export async function renderTaxPlanPdf({ org, data }: { org: Organization; data: TaxPlanData }): Promise<Buffer> {
  ensureFonts();
  const active = data.opportunities.filter((o) => o.status !== "dismissed");
  const withBenefit = active.filter((o) => o.estimatedBenefit > 0);
  const qualitative = active.filter((o) => o.estimatedBenefit <= 0);

  return renderToBuffer(
    <Document title={`Φορολογικό πλάνο ${org.name} ${data.year}`}>
      <Page size="A4" style={s.page}>
        <View style={{ borderBottomWidth: 1.5, borderBottomColor: "#171717", paddingBottom: 8 }}>
          <Text style={s.h1}>Πρόταση φορολογικής βελτιστοποίησης</Text>
          <Text style={s.muted}>
            {org.name} · ΑΦΜ {org.afm || "—"}
            {org.doy ? ` · ${org.doy}` : ""} · χρήση {data.year}
          </Text>
        </View>

        <Text style={s.h2}>Σύνοψη</Text>
        <View style={s.summaryRow}>
          {[
            ["Δυνητικό όφελος/έτος", `~${money(data.totalBenefit)}`],
            ["Εκτιμώμενος φόρος", money(data.forecast.projectedTax)],
            ["Προκαταβολή φόρου", money(data.forecast.advanceTax)],
            ["Ετήσιος ΕΦΚΑ", money(data.forecast.efkaAnnual)],
            ["Σύνολο υποχρεώσεων", money(data.forecast.totalObligations)],
            ["Συνιστ. μηνιαία κράτηση", money(data.forecast.monthlyReserve)],
          ].map(([k, v]) => (
            <View key={k} style={s.kpi}>
              <Text style={s.kpiLabel}>{k}</Text>
              <Text style={s.kpiValue}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>Ευκαιρίες με ποσοτικό όφελος ({withBenefit.length})</Text>
        {withBenefit.length === 0 ? (
          <Text style={s.muted}>Δεν εντοπίστηκαν ευκαιρίες με άμεσα υπολογίσιμο όφελος στα τρέχοντα δεδομένα.</Text>
        ) : (
          withBenefit.map((o) => (
            <View key={o.ruleCode} style={s.opp} wrap={false}>
              <View style={s.oppHead}>
                <Text style={s.oppTitle}>{o.title}</Text>
                <Text style={s.benefit}>~{money(o.estimatedBenefit)}/έτος</Text>
              </View>
              <Text style={{ marginTop: 2 }}>{o.rationale}</Text>
              <Text style={s.label}>Ενέργεια:</Text>
              <Text>{o.action}</Text>
              <Text style={[s.small, { marginTop: 3 }]}>
                Νομική βάση: {o.legalBasis} · Προτεραιότητα: {SEV[o.severity]?.label ?? o.severity}
                {o.status === "applied" ? " · ΕΦΑΡΜΟΣΤΗΚΕ" : ""}
              </Text>
            </View>
          ))
        )}

        {qualitative.length > 0 ? (
          <>
            <Text style={s.h2}>Ποιοτικές συστάσεις ({qualitative.length})</Text>
            {qualitative.map((o) => (
              <View key={o.ruleCode} style={{ marginBottom: 6 }} wrap={false}>
                <Text style={s.label}>{o.title}</Text>
                <Text style={s.muted}>{o.action}</Text>
                <Text style={s.small}>Νομική βάση: {o.legalBasis}</Text>
              </View>
            ))}
          </>
        ) : null}

        <Text style={s.h2}>Ενέργειες πριν το κλείσιμο χρήσης ({data.yearEnd.daysLeft} ημέρες)</Text>
        {data.yearEnd.actions.map((a, i) => (
          <View key={i} style={{ marginBottom: 6 }} wrap={false}>
            <View style={s.oppHead}>
              <Text style={s.oppTitle}>{a.title}</Text>
              {a.impact > 0 ? <Text style={s.benefit}>~{money(a.impact)}</Text> : null}
            </View>
            <Text style={s.muted}>{a.detail}</Text>
            <Text style={s.small}>Νομική βάση: {a.legalBasis}</Text>
          </View>
        ))}

        <Text style={s.h2}>Πόρισμα</Text>
        <Text style={s.muted}>
          Η παρούσα πρόταση παρουσιάζει νόμιμες δυνατότητες φορολογικής βελτιστοποίησης βάσει των τρεχόντων δεδομένων της
          επιχείρησης και της ισχύουσας νομοθεσίας. Οι εκτιμήσεις είναι ενδεικτικές, δεν υποκαθιστούν τη φορολογική δήλωση
          και προϋποθέτουν επιβεβαίωση από τον λογιστή πριν την εφαρμογή.
        </Text>

        <View style={{ marginTop: 18, flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text style={s.label}>Σύνταξη</Text>
            <Text style={s.muted}>{data.preparedByName}</Text>
            {data.firmName ? <Text style={s.muted}>{data.firmName}</Text> : null}
          </View>
          <View>
            <Text style={s.label}>Ημερομηνία</Text>
            <Text style={s.muted}>{new Date().toLocaleDateString("el-GR")}</Text>
          </View>
        </View>

        <Text style={s.footer} fixed>
          Φορολογικό πλάνο {org.name} · χρήση {data.year} · Σύνολο ERP · δημιουργήθηκε {new Date().toLocaleString("el-GR")}
        </Text>
      </Page>
    </Document>,
  );
}
