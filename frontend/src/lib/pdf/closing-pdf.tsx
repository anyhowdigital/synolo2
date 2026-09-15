import path from "node:path";
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Organization } from "@/db/schema";
import type { MonthlyClose } from "@/lib/services/monthly-close";

const MONTHS = ["Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου", "Ιουνίου", "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου"];

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
  h1: { fontSize: 15, fontWeight: 700, marginBottom: 4 },
  h2: { fontSize: 11, fontWeight: 700, marginTop: 16, marginBottom: 6 },
  muted: { color: "#525252" },
  row: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5", paddingVertical: 4 },
  itemTitle: { fontWeight: 700 },
  badge: { fontSize: 8, fontWeight: 700 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 7.5, color: "#737373", textAlign: "center" },
  cell: { width: "48%" },
});

const STATUS = { ok: { label: "ΟΚ", color: "#15803d" }, warn: { label: "ΠΡΟΣΟΧΗ", color: "#b45309" }, blocker: { label: "ΕΜΠΟΔΙΟ", color: "#b91c1c" } };
const money = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

export function closingPdfFilename(month: string) {
  return `kleisimo-${month}.pdf`;
}

export async function renderClosingPdf({ org, close }: { org: Organization; close: MonthlyClose }): Promise<Buffer> {
  ensureFonts();
  const [y, m] = close.month.split("-").map(Number);
  const title = `${MONTHS[m - 1]} ${y}`;
  return renderToBuffer(
    <Document title={`Έκθεση κλεισίματος ${close.month}`}>
      <Page size="A4" style={s.page}>
        <View style={{ borderBottomWidth: 1.5, borderBottomColor: "#171717", paddingBottom: 8 }}>
          <Text style={s.h1}>Έκθεση μηνιαίου κλεισίματος</Text>
          <Text style={s.muted}>
            {org.name} · ΑΦΜ {org.afm} · περίοδος {title} ({close.period.from} – {close.period.to})
          </Text>
        </View>

        <Text style={s.h2}>Σύνοψη</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          {[
            ["Παραστατικά", String(close.totals.documents)],
            ["Καθαρή αξία εσόδων", money(close.totals.net)],
            ["ΦΠΑ εκροών", money(close.totals.vatOut)],
            ["ΦΠΑ εισροών", money(close.totals.vatIn)],
            ["Θέση ΦΠΑ", `${close.totals.position >= 0 ? "χρεωστικό" : "πιστωτικό"} ${money(Math.abs(close.totals.position))}`],
            ["Έξοδα (καθαρά)", money(close.totals.expenses)],
          ].map(([k, v]) => (
            <View key={k} style={[s.row, s.cell]}>
              <Text style={s.muted}>{k}</Text>
              <Text style={s.itemTitle}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>Έλεγχοι κλεισίματος</Text>
        {close.items.map((it) => (
          <View key={it.key} style={{ marginBottom: 7 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={s.itemTitle}>{it.title}</Text>
              <Text style={[s.badge, { color: STATUS[it.status].color }]}>{STATUS[it.status].label}</Text>
            </View>
            <Text style={s.muted}>{it.detail}</Text>
          </View>
        ))}

        <Text style={s.h2}>Πόρισμα</Text>
        <Text>
          {close.canClose
            ? `Ο μήνας ${title} μπορεί να κλείσει: δεν εντοπίστηκαν εμπόδια${close.warnings ? `, με ${close.warnings} σημεία προσοχής` : ""}.`
            : `Ο μήνας ${title} ΔΕΝ μπορεί να κλείσει: εντοπίστηκαν ${close.blockers} εμπόδια που πρέπει να διορθωθούν πρώτα.`}
        </Text>
        <Text style={[s.muted, { marginTop: 6 }]}>
          Η έκθεση παράγεται αυτόματα από τα βιβλία της επιχείρησης και έχει ενημερωτικό χαρακτήρα· δεν αντικαθιστά τη φορολογική δήλωση ή τη γνώμη του λογιστή.
        </Text>

        <Text style={s.footer} fixed>
          Έκθεση κλεισίματος {close.month} · {org.name} · δημιουργήθηκε {new Date().toLocaleString("el-GR")} · Σύνολο ERP
        </Text>
      </Page>
    </Document>,
  );
}
