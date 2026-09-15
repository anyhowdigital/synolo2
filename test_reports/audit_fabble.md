# Audit για fabble — Τιμολόγηση / B2G / Ρυθμίσεις / UX
Ημερομηνία: 13/06/2026 · Μέθοδος: read-only (κώδικας + live UI clicks + πραγματική παραγωγή UBL από τις εγγραφές της βάσης). **Καμία αλλαγή σε app source.**

Περιβάλλον: https://cashflow-pro-295.preview.emergentagent.com · logins `demo@timologio.gr / demo1234`, `office@koletsas.gr / office1234`

---

## 0. ΡΙΖΑ ΠΟΛΛΩΝ ΠΡΟΒΛΗΜΑΤΩΝ: μισοτελειωμένες διορθώσεις (uncommitted)
`git status` δείχνει 8 τροποποιημένα αρχεία που **δεν έχουν ολοκληρωθεί**:
`b2g/providers.ts`, `b2g/ubl.ts`, `services/b2g.ts`, `services/bonuses.ts`, `services/ergani-api.ts`, `services/leave.ts`, `services/payroll.ts`, `services/sepa.ts`

Νεκρός κώδικας που αποδεικνύει ότι η δουλειά έμεινε στη μέση:
| Αρχείο | Τι μπήκε | Τι λείπει |
|---|---|---|
| `b2g/ubl.ts:130-132` | `const credit`, `const root`, `const lineTag` | **Δεν χρησιμοποιούνται πουθενά** — το XML template παραμένει hardcoded `<Invoice>` / `<cac:InvoiceLine>` |
| `services/b2g.ts:8` | import `hasUnsupportedB2GAdjustments`, `B2G_ADJUSTMENT_ERROR` | **Δεν καλούνται** στο `validateB2G` |
| `services/bonuses.ts:1` | import `addDays, addMonths, differenceInDays, differenceInMonths` | **0 χρήσεις** — το bug endDate δεν διορθώθηκε |
| `services/leave.ts:2` | import `gte, lte, inArray` | **0 χρήσεις** — ο έλεγχος επικάλυψης αδειών δεν γράφτηκε |

---

## 1. B2G / PEPPOL — CRITICAL

### B1. Πιστωτικό τιμολόγιο βγάζει λάθος UBL root — **σίγουρη απόρριψη από PEPPOL**
Πραγματικό output για το ΠΤ 5.1 (`1f23e3ae-77f6-4405-a022-27967c8f0f76`):
```
root=Invoice  typeCode=InvoiceTypeCode:381  billingRef=false
```
- Πρέπει: `<CreditNote xmlns="...:CreditNote-2">` + `<cbc:CreditNoteTypeCode>381` + `<cac:CreditNoteLine>`.
- Αρχείο: `src/lib/b2g/ubl.ts` (γραμμές 130-132 υπολογίζουν σωστά `root`/`lineTag`, το template στη γραμμή ~199 και ~170 τα αγνοεί).

### B2. Πιστωτικό χωρίς `cac:BillingReference` (BT-25)
Το PEPPOL απαιτεί αναφορά στο αρχικό τιμολόγιο σε κάθε credit note. Δεν εκπέμπεται ποτέ, ενώ το πεδίο `correlatedInvoiceId` υπάρχει στη βάση. `ubl.ts`.

### B3. Παραβίαση BR-24: `Price × Quantity ≠ LineExtensionAmount`
Επαληθεύτηκε με πραγματική κλήση του builder (ποσότητα 3, καθαρό 100 €):
```
qty=3  PriceAmount=33.33  → 3×33.33 = 99.99  αλλά LineExtensionAmount = 100.00
```
Αιτία: `ubl.ts:~168` `unitPrice = round2(netValue / quantity)` — στρογγυλοποίηση σε 2 δεκαδικά. Λύση: `BaseQuantity` ή τιμή με 4-6 δεκαδικά (το UBL το επιτρέπει).

### B4. Τιμολόγια με παρακράτηση/χαρτόσημο: σκληρό `throw` → **HTTP 500 στον χρήστη**
- `ubl.ts:126` `hasUnsupportedB2GAdjustments` → `throw`.
- Live: `GET /api/invoices/f33407d2-…/ubl` → **500, λευκή σελίδα, χωρίς μήνυμα**.
- Το κουμπί «Λήψη UBL XML» στο `b2g-card.tsx` εμφανίζεται **πάντα**, ακόμη κι όταν το XML δεν μπορεί να παραχθεί.
- Το `validateB2G` **δεν** προειδοποιεί εκ των προτέρων (ο guard είναι imported αλλά ανενεργός) → ο χρήστης πατάει «Αποστολή» και παίρνει raw exception.
- Το ίδιο σκάει και στο `previewB2GAction` (`actions/b2g.ts:117`) — μη-χειρισμένο throw σε server action.

### B5. `normalizeStatus` χάνει πραγματικές καταστάσεις παρόχων (`b2g/providers.ts:172-177`)
Τα regex για accepted/sent είναι **anchored** (`^…$`):
```
"Accepted by entity"  -> pending   (λάθος: accepted)
"delivered"           -> accepted  ✔
"ΑΠΟΔΕΚΤΟ"            -> pending   (λάθος)
"Sent to buyer"       -> pending   (λάθος: sent)
"PARTIALLY_ACCEPTED"  -> pending   (ασαφές)
```
Συνέπεια: τιμολόγια που ο φορέας δέχτηκε μένουν για πάντα «Σε αναμονή παρόχου». (Το παλαιότερο bug `'not accepted' → accepted` **έχει** διορθωθεί.)

### B6. Ακυρωμένα παραστατικά μπορούν να διαβιβαστούν στο Δημόσιο
`services/b2g.ts:16-37` — μόνο το `status === "draft"` μπλοκάρει. `cancelled` / `void` περνάει με `errors=[]`.

### B7. Ασυνεπής/υπερβολικός έλεγχος BT-11 → κλειδωμένη επαναποστολή
Live στο ΤΠ ΤΠ-0003 (`bb64fa4d…`): κατάσταση **«Αποδεκτό από φορέα»** και ταυτόχρονα κόκκινο «Λείπει η αναφορά έργου/προϋπολογισμού (BT-11)» με το κουμπί επαναποστολής **disabled**. Το BT-11 είναι προαιρετικό στο PEPPOL BIS 3.0 (υποχρεωτικό είναι το ΑΔΑΜ/BT-12 για το ελληνικό Δημόσιο) → πρέπει να γίνει προειδοποίηση, όχι blocker.

### B8. Λείπουν στοιχεία που ζητούν οι φορείς
Το XML δεν περιέχει ποτέ: `cac:PaymentTerms`, `cbc:PaymentDueDate` σε CreditNote-σενάρια, `cac:AllowanceCharge` (εκπτώσεις γραμμής χάνονται μέσα στο netValue), `cac:WithholdingTaxTotal` (BT-88), `cbc:AccountingCost`. Επίσης `PaymentMeansCode` καρφωμένο σε `58` (SEPA credit transfer) ανεξαρτήτως τρόπου πληρωμής του παραστατικού.

### B9. `validateB2G` απαιτεί IBAN αλλά η φόρμα Επιχείρησης δεν τον επικυρώνει
`actions/settings.ts:58` — `iban: z.string()` χωρίς έλεγχο. Ο οργανισμός «ANYHOW ΙΚΕ» έχει `b2g_enabled=1` και **κενό IBAN** στη βάση → κάθε αποστολή θα μπλοκάρει με μήνυμα που ο χρήστης θα δει μόνο στο παραστατικό.

### B10. Ελλιπής επικύρωση αναφορών B2G πελάτη
Στη βάση υπάρχουν πελάτες-φορείς με `b2g_buyer_reference = "Dhdjsjs"`, `b2g_contract_adam = "72hdjebdjxbes"`, `b2g_project_reference = "9ΗΧΦ0ΡΣΔ-ΤΒY"` (χωρίς το υποχρεωτικό prefix `1|2|3`). Κανένας έλεγχος μορφής στη φόρμα πελάτη — το λάθος εμφανίζεται μόνο κατά την αποστολή.

---

## 2. Ρυθμίσεις — HIGH

### S1. Απώλεια δεδομένων στην αποθήκευση B2G
`actions/b2g.ts:53-68` γράφει **πάντα** `b2gBaseUrl` και `b2gUsername`, αλλά το `b2g-settings-form.tsx` εμφανίζει αυτά τα πεδία μόνο για τον επιλεγμένο πάροχο. Αν αλλάξεις πάροχο σε «Προσομοίωση» (fields = []) και πατήσεις Αποθήκευση, **σβήνονται base URL και username** του αποθηκευμένου παρόχου. Επίσης δεν υπάρχει τρόπος να **καθαρίσεις** ένα secret (`d.b2gApiKey || org.b2gApiKey`).

### S2. Κανένας έλεγχος πληρότητας διαπιστευτηρίων
Μπορείς να ενεργοποιήσεις B2G + Παραγωγή + πάροχο Impact **χωρίς** base URL/κλειδί. Το σφάλμα εμφανίζεται πολύ αργότερα, στο πρώτο πραγματικό τιμολόγιο. Επίσης η επιλογή `Περιβάλλον = Παραγωγή` δεν έχει καμία επιβεβαίωση.

### S3. 2 από 15 tabs κάνουν full page reload, τα άλλα 13 όχι
`settings/page.tsx:119-126` — τα `Διασυνδέσεις & API` και `Ιστορικό` είναι `TabsTrigger asChild <Link>`. Αποτέλεσμα (επαληθεύτηκε live):
- ανομοιογενής ταχύτητα/συμπεριφορά,
- μετά το κλικ σε «Διασυνδέσεις & API», τα επόμενα κλικ σε άλλα tabs **αφήνουν το URL στο `?tab=developer`** → refresh/share δείχνει λάθος tab,
- το `defaultValue` (όχι `value`) σημαίνει ότι το URL δεν είναι ποτέ source of truth.

### S4. TabsList 15 στοιχείων «σπάει» σε 2-3 σειρές
Live screenshot desktop 1920px: η δεύτερη σειρά tabs εμφανίζεται κεντραρισμένη/τυχαία («Εξαγωγή δεδομένων» και «Ιστορικό» αποκομμένα). Σε mobile 390px γίνονται 6 σειρές. Θέλει scrollable tab bar ή select/sidebar.

### S5. Σιωπηλή απόρριψη τιμής
`actions/settings.ts:109` — αν το `stripeAccountId` δεν ματσάρει `^acct_…`, αποθηκεύεται **null χωρίς κανένα μήνυμα**· ο χρήστης νομίζει ότι σώθηκε.

### S6. Δεν υπάρχουν tabs «Πληρωμές» και «Ειδοποιήσεις»
Οι ρυθμίσεις πληρωμών (Viva/Stripe/IRIS) είναι κρυμμένες μέσα στο tab «Τιμολόγηση» (`VivaStatusPanel`), και οι ρυθμίσεις υπενθυμίσεων/ειδοποιήσεων επίσης. Δύσκολα ανακαλύψιμα.

---

## 3. Τιμολόγηση & γενικό UX

### U1. Hydration mismatch στο `/invoices/new` (επαληθεύτηκε live στην κονσόλα)
`components/invoices/invoice-editor.tsx:112` `const today = format(new Date(), "yyyy-MM-dd")` μέσα σε client component → server (UTC) και browser (Europe/Athens) δίνουν διαφορετική ημερομηνία μετά τις 02:00 → React error + πιθανή **λάθος ημερομηνία έκδοσης**.
Ίδιο μοτίβο σε ~20 σημεία: `expenses-ui.tsx:327,333`, `banking/entry-dialogs.tsx:30,132`, `customers/credit-ui.tsx:44,177,274`, `suppliers/payment-dialog.tsx:44`, `accounting/gl-ui.tsx:107`, `office/employee-form.tsx:43`, `office/payroll-extras.tsx:21,139`, `inventory/count-ui.tsx:24`, `projects/*`, `recurring-ui.tsx:221`, `invoice-actions.tsx:402`.

### U2. Λίστα παραστατικών: αντιφατικά πρόσημα στα πιστωτικά
`invoices-table.tsx:186-188` βάζει «-» **μόνο** στη στήλη «Σύνολο». Live: ΠΤ-0001 → `Καθαρό 200,00 €` / `Σύνολο -248,00 €`. Είτε και τα δύο αρνητικά, είτε κανένα (και badge «Πιστωτικό»).

### U3. Πίνακας παραστατικών ξεφεύγει από το viewport σε mobile
390×844 `/invoices`: overflow σε `table` και `th/td` (`whitespace-nowrap`) — οριζόντια κύλιση όλης της σελίδας. Τα `/invoices/new`, `/settings`, `/dashboard` είναι OK (0 overflow).

### U4. Φίλτρα ημερομηνίας σε αγγλική μορφή
`/invoices`: τα native date inputs δείχνουν `mm/dd/yyyy` ενώ όλες οι ημερομηνίες στον πίνακα είναι `12/09/2026` (el-GR) → πραγματικός κίνδυνος λάθος φίλτρου. Λείπει `lang="el"` / μορφοποιημένο date picker.

### U5. `/office/dashboard` → 404
Επαληθεύτηκε live (404 «Η σελίδα δεν βρέθηκε»). Δεν υπάρχει πλέον link προς αυτό στο sidebar, αλλά είναι bookmark-able/ιστορικό. Θέλει redirect → `/office`.

### U6. `/accountant` για owner → σιωπηλό redirect σε `/dashboard?office=denied`
Καμία εξήγηση στον χρήστη γιατί απορρίφθηκε. Θέλει toast/σελίδα εξήγησης.

### U7. Μισθοδοσία: `leaveAllowance` αγνοεί `endDate` (ακόμα ενεργό)
`services/bonuses.ts:69,84` περνάει `endDate: null` → εργαζόμενος με αποχώρηση 31/01 παίρνει ίδιο επίδομα αδείας (600 €) με όποιον δούλεψε όλο το έτος.

---

## 4. Τι ελέγχθηκε και δουλεύει
- 28/28 routes business portal → 200 με σωστό heading. 17/18 office routes → 200 (`/office/dashboard` 404, `/office/cockpit` 429 = throttle preview, όχι bug).
- `npx tsc --noEmit` → **0 λάθη**.
- Invoice PDF, myDATA οθόνες, φίλτρα λίστας, Διπλογραφικά (τα άρθρα πιστωτικού αντιστρέφονται σωστά, `gl.ts:229-240`), GL ισοσκέλιση, mobile responsive σε dashboard/settings/new-invoice.
- `normalizeStatus`: το παλιό `'not accepted' → accepted` **διορθώθηκε**.
- `sepa.ts` greeklish transliteration & `ergani-api.ts athensIso` (σωστό offset μέσω `longOffset`) φαίνονται σωστά διορθωμένα.
- `payroll.ts computeRun`: το bug «μισθωτός με 1 βάρδια → 48 € αντί 1.200 €» **έχει διορθωθεί** (`emp.grossSalary > 0 ? 25 : …`).

## 5. Προτεινόμενη σειρά διόρθωσης
1. B1, B2, B3 (UBL — αλλιώς κάθε πιστωτικό/ποσότητα>1 απορρίπτεται)
2. B4, B6, B7 + S1, S2 (να μη χάνονται ρυθμίσεις / να μη σκάει 500)
3. B5 (καταστάσεις παρόχου)
4. U1 (hydration/ημερομηνίες), U2, U3, U4
5. S3, S4, S6, U5, U6, U7
