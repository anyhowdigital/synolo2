# Πίνακας συμμόρφωσης προτύπων — Σύνολο ERP (2026-06)

| Πρότυπο | Κατάσταση | Τι έγινε | Εκκρεμεί |
|---|---|---|---|
| **PEPPOL BIS 3.0 / Greek CIUS (B2G)** | ✅ Συμμορφώνεται (iteration_52: 34/34) | BT-1 6 τμήματα `ΑΦΜ\|ηη/ΜΜ/εεεε\|εγκ.\|τύπος\|σειρά\|αριθμός` (GR-R-001)· ΜΑΡΚ `##M.AR.K##` υποχρεωτικό (GR-R-004)· `##INVOICE\|URL##` (GR-S-008)· BT-11 regex `^[123]\|…`· BT-12 ΑΔΑΜ ή «0» πάντα· BT-46 C.A. label code υποχρεωτικό· BT-49 σταθερό `9933:997001671`· CPV BT-158 ανά γραμμή (`listID="STI"`), σε πελάτη/παραστατικό· Soft-reject `##SOFT\|REJECT##`· πιστωτικό χωρίς BillingReference → `##PROJECT\|REFERENCE##` + DocumentTypeCode 50· EUR only· φόρμα στοιχείων σύμβασης ανά παραστατικό (κλειδώνει μετά την αποστολή) | Παρακράτηση/χαρτόσημο σε B2G (μπλοκάρεται με σαφές μήνυμα — χρειάζεται επίσημη χαρτογράφηση ΚΕ.Δ.)· ζωντανός πάροχος PEPPOL (τώρα simulation)· επαλήθευση `listID=STI` με validator ΓΓΠΣ (webapps.gsis.gr/dsae2/invoicetools) |
| **myDATA (ΑΑΔΕ REST)** | ✅ Βασικά · ⚠️ 2 εκκρεμότητες | Σελιδοποίηση `nextPartitionKey/nextRowKey` σε RequestDocs/RequestTransmittedDocs/RequestMyIncome· idempotency: πριν από επαναποστολή errored παραστατικού υιοθετείται υπάρχον ΜΑΡΚ από RequestTransmittedDocs· προσφορές εκτός διαβίβασης· ακύρωση μόνο μέσω CancelInvoice | POS: `paymentMethodDetails` type 7 με `transactionId/tid/ProvidersSignature/tipAmount` (νέο data model)· `entityVatNumber` σε CancelInvoice για ρόλο παρόχου· dispatchTime 9.3 |
| **ΕΛΠ / Διπλογραφικά (GL)** | ✅ (iteration_51: 15/15) | Άρθρα με παρακράτηση (33) & χαρτόσημο (54.09) ισοσκελισμένα· πιστωτικά με `credit` flag (11.4/13.31 σωστό πρόσημο)· αποκλεισμός expenseSide (3.x)· αντιλογισμός σε ακύρωση· period lock σε postEntry/deleteEntry/deleteExpense/undoImport· unique index αριθμών (org, series, number) | Αντιλογισμός πληρωμών/αποθέματος σε ακύρωση· ΦΠΑ ανά κατηγορία 7 vs 8 στο vatBreakdown |
| **Αρίθμηση παραστατικών (ΚΦΔ)** | ✅ | Unique index `invoices_org_series_number_unique` (μη πρόχειρα)· εκδοθέντα δεν διαγράφονται (undo import απορρίπτεται) | — |
| **ΦΠΑ (Φ2)** | ✅ Υφιστάμενο | Reports/f2, συμφωνία με myDATA | Έλεγχος κατηγοριών 7/8 χωριστά |
| **ΕΡΓΑΝΗ** | ⚠️ Υφιστάμενο (live API με κλειδί χρήστη) | — | Δεν έγινε audit σε αυτή τη φάση |
| **Ηλεκτρονικά βιβλία / Πάροχος ΥΠΑΗΕΣ** | 📋 Roadmap | Βλ. PROVIDER_READINESS.md | Φάση 1 (αυθεντικοποίηση, διαφύλαξη, ελεγκτική διεπαφή) |

Πηγές: gsis.gr «Instructions for foreign B2G providers» (Feb 2026), docs.peppol.eu BIS Billing 3.0 (May 2026 release) GR-R-001…GR-R-010, ΥΑ 63446/2021.
