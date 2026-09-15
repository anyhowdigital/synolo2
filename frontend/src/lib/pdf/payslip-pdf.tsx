import path from "node:path";
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Organization } from "@/db/schema";

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
  page: { padding: 36, fontSize: 9, fontFamily: "NotoSans", color: "#171717" },
  h1: { fontSize: 15, fontWeight: 700 },
  muted: { color: "#666", fontSize: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 3 },
  box: { marginTop: 14, borderWidth: 0.5, borderColor: "#ccc", borderRadius: 4, padding: 10 },
  strong: { fontWeight: 700 },
});

export interface PayslipData {
  month: string;
  employeeName: string;
  afm: string;
  amka: string;
  specialty: string;
  days: number;
  gross: number;
  overtimeAmount: number;
  bonus: number;
  efkaEmployee: number;
  efkaEmployer: number;
  tax: number;
  net: number;
}

const eur = (n: number) => `${n.toFixed(2)} €`;

export function payslipFilename(month: string, name: string) {
  return `Apodoxes_${month}_${name.replace(/\s+/g, "_")}.pdf`;
}

export async function renderPayslipPdf({ org, data, signer }: { org: Organization; data: PayslipData; signer?: { name: string; regNo: string; firmName: string; code: string; verifyUrl: string } }) {
  ensureFonts();
  return renderToBuffer(
    <Document title={`Απόδειξη αποδοχών ${data.month}`}>
      <Page size="A4" style={s.page}>
        <View style={{ borderBottomWidth: 1.5, borderBottomColor: "#171717", paddingBottom: 8 }}>
          <Text style={s.h1}>Απόδειξη αποδοχών</Text>
          <Text style={s.muted}>
            {org.name} · ΑΦΜ {org.afm} · μισθολογική περίοδος {data.month}
          </Text>
        </View>

        <View style={s.box}>
          <Text style={s.strong}>Στοιχεία εργαζομένου</Text>
          <View style={s.row}>
            <Text>Ονοματεπώνυμο</Text>
            <Text>{data.employeeName}</Text>
          </View>
          <View style={s.row}>
            <Text>ΑΦΜ / ΑΜΚΑ</Text>
            <Text>
              {data.afm || "—"} / {data.amka || "—"}
            </Text>
          </View>
          <View style={s.row}>
            <Text>Ειδικότητα</Text>
            <Text>{data.specialty || "—"}</Text>
          </View>
          <View style={s.row}>
            <Text>Ημέρες ασφάλισης</Text>
            <Text>{data.days}</Text>
          </View>
        </View>

        <View style={s.box}>
          <Text style={s.strong}>Αποδοχές & κρατήσεις</Text>
          <View style={s.row}>
            <Text>Ακαθάριστες αποδοχές</Text>
            <Text>{eur(data.gross)}</Text>
          </View>
          <View style={s.row}>
            <Text>Από τις οποίες υπερωρίες</Text>
            <Text>{eur(data.overtimeAmount)}</Text>
          </View>
          <View style={s.row}>
            <Text>Από τις οποίες έκτακτες παροχές</Text>
            <Text>{eur(data.bonus)}</Text>
          </View>
          <View style={s.row}>
            <Text>Εισφορές ΕΦΚΑ εργαζομένου</Text>
            <Text>-{eur(data.efkaEmployee)}</Text>
          </View>
          <View style={s.row}>
            <Text>Φόρος μισθωτών υπηρεσιών (ΦΜΥ)</Text>
            <Text>-{eur(data.tax)}</Text>
          </View>
          <View style={[s.row, { borderBottomWidth: 0, marginTop: 4 }]}>
            <Text style={s.strong}>Καθαρό πληρωτέο</Text>
            <Text style={s.strong}>{eur(data.net)}</Text>
          </View>
          <Text style={s.muted}>Εργοδοτικές εισφορές ΕΦΚΑ: {eur(data.efkaEmployer)} (δεν αφαιρούνται από τις αποδοχές)</Text>
        </View>

        {signer ? (
          <View style={[s.box, { marginTop: 22 }]}>
            <Text style={s.strong}>Θεώρηση λογιστή</Text>
            <Text>{signer.name}</Text>
            <Text style={s.muted}>
              {signer.firmName}
              {signer.regNo ? ` · Α.Μ. ΟΕΕ ${signer.regNo}` : ""}
            </Text>
            <Text style={[s.muted, { marginTop: 6 }]}>
              Κωδικός αυθεντικοποίησης: {signer.code} · Επαλήθευση: {signer.verifyUrl}
            </Text>
          </View>
        ) : null}

        <Text style={[s.muted, { marginTop: 18 }]}>
          Η απόδειξη εκδόθηκε ηλεκτρονικά από το Σύνολο ERP. Ο εργαζόμενος διατηρεί κάθε δικαίωμα ελέγχου των στοιχείων.
        </Text>
      </Page>
    </Document>,
  );
}
