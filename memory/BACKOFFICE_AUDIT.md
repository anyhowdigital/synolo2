# Back offices — πρώτο επαληθευμένο διαγνωστικό πακέτο

## Εντολή και όρια
Ο χρήστης ζήτησε ισχυρούς ελέγχους design/UX στα back offices επιχείρησης και λογιστή, εντοπισμό δυσνόητων/διπλών λειτουργιών, λειτουργικές γέφυρες και προετοιμασία δικού του παρόχου ηλεκτρονικής τιμολόγησης. Εγκρίθηκε πρώτα ΜΟΝΟ διάγνωση/απογραφή, με έμφαση στην ταχύτητα. Κάθε υλοποίηση απαιτεί νέα έγκριση. Super Admin και ChatGPT εκτός.

Πραγματικός ιδιοκτήτης: kkoletsas@gmail.com, αμετάβλητος. Έλεγχοι με υπάρχοντες δοκιμαστικούς λογαριασμούς, χωρίς μεταβολή επιχειρηματικών δεδομένων ή διαπιστευτηρίων. Καμία εξωτερική υποβολή, χρέωση ή αποστολή email.

## Τι αποδείχθηκε — χωρίς υπερβολή κάλυψης
- Πραγματικές συνδέσεις επιχείρησης και γραφείου.
- Main-agent browser: `/settings?tab=bridge` και `/office/clients/fa82eab8-ce41-4d73-8a3f-05a0f63f1002/bridge` σε 1920×800 και 390×844. Στις δύο γέφυρες mobile `OVERFLOW []`.
- Main-agent browser: `/invoices/new` και `/office/alerts` σε 390×844, χωρίς submit.
- Main-agent UI interaction: αποεπιλογή και των πέντε οντοτήτων εξαγωγής· το ενεργό link εξακολουθεί να παραλείπει `entities`, άρα ζητά όλα.
- 10 offline assertions πραγματικών συναρτήσεων bridge: 3 πέρασαν, 7 απέτυχαν. Οι απαντήσεις δικτύου είναι **MOCKED**. Δεν είναι δείκτης ποιότητας όλης της εφαρμογής και δεν αποδεικνύουν αποδοχή από πραγματικό πάροχο.
- Στατική απογραφή υπηρεσιών/ενεργειών/ροών και read-only έλεγχος παρουσίας ρυθμίσεων στη SQLite.
- Δεν έγιναν πλήρης έλεγχος όλων των οθονών/ρόλων, πληκτρολόγιο/contrast/dark-mode audit, import commits, financial race tests, φορολογική πιστοποίηση ή live vendor tests.

## P1 — επιβεβαιωμένα λειτουργικά ευρήματα

| ID | Εύρημα / αναπαραγωγή | Συνέπεια | Απόδειξη |
|---|---|---|---|
| B01 | Bridge CSV έξοδα: `1.234,56` → `1.234`, όχι `1234.56` | Λανθασμένα οικονομικά ποσά | Offline FAIL· `lib/accounting-bridge/index.ts:401–406` |
| B02 | Bridge είδη: στήλη ΦΠΑ `24` → `vatCategory=24` αντί κωδικού myDATA `1` | Μη έγκυρη κατηγορία, ασυμβατότητα με invoice validation 1–8 | Offline FAIL· parser:509–519, invoice/schema.ts:10 |
| B03 | SoftOne export μόνο `income,expenses` → JSON μόνο `meta` | Λείπουν τα επιλεγμένα οικονομικά δεδομένα | Offline FAIL· bridge:252–261· QA αναφέρει επίσης GET σε business/office, αλλά ανεξάρτητη browser επιβεβαίωση αυτών των GET δεν αποθηκεύτηκε |
| B04 | SoftOne επιτυχές login, αποτυχημένο authenticate → καλείται setData | Συνεχίζεται write flow παρά άρνηση εταιρικής πρόσβασης | Offline **MOCKED** FAIL· bridge:187–202 |
| B05 | SoftOne όλες οι εγγραφές απορρίπτονται → `ok:true`, 0 επιτυχίες | Ψευδής επιτυχία | Offline **MOCKED** FAIL· bridge:193–202 |
| B06 | Generic/Epsilon REST: HTTP200 με `{success:false}` → `ok:true` | Δεν ελέγχεται επιχειρησιακή αποδοχή· απαιτείται συγκεκριμένο vendor contract | Offline **MOCKED** FAIL· bridge:205–211 |
| B07 | SoftOne export πελατών → δικός μας importer → 0 εγγραφές | Ασυμβατότητα μορφών, όχι πλήρης roundtrip | Offline FAIL· bridge:338–347 έναντι 257 |
| B08 | Αποεπιλογή ΟΛΩΝ των checkbox αφήνει ενεργή εξαγωγή ΟΛΩΝ | Αντίθετη ενέργεια από την επιλογή χρήστη | Main browser· `accounting-bridge-card.tsx:36,136–138` |
| U01 | `/office/alerts`: «Διόρθωσέ το» πηγαίνει πάντα `/office/bulk`, χωρίς πελάτη/εύρημα | Χάνεται το πλαίσιο της διόρθωσης, απαιτείται νέα επιλογή | Main browser href + `office/alerts/page.tsx:80–82` |
| U02 | Στα alerts εμφανίζεται το ΠΡ-1 ως μη διαβιβασμένο στο myDATA | Η λίστα ζητά διαβίβαση προσφοράς ενώ η ίδια η υπηρεσία την απαγορεύει | Main screenshot + `client-alerts.ts:37,75–85` χωρίς αποκλεισμό quote, `invoices.ts:421` απαγορεύει quotes |

## P1 — στατικά επιβεβαιωμένοι κίνδυνοι, χωρίς μεταβολή δεδομένων
- **B09 Επιλογές live αποστολής αγνοούνται:** `pushBridgeAction` δέχεται `entities` αλλά προωθεί ολόκληρο dataset (`actions/accounting-bridge.ts:166–175`). Δεν δοκιμάστηκε live.
- **B10 Απώλεια στοιχείων επαφής:** update υπάρχοντος πελάτη/προμηθευτή βάζει `''` σε πεδία που δεν υπήρχαν στο αρχείο (102,111). Δεν εκτελέστηκε εισαγωγή στη βάση του χρήστη.
- **B11 Διπλά έξοδα:** η γέφυρα εισάγει κάθε γραμμή με νέο UUID, χωρίς αποδιπλοποίηση (69–74). Η ξεχωριστή γενική εισαγωγή CSV ήδη περιγράφει αποδιπλοποίηση/undo στο PRD — διαφορετική συμπεριφορά για ίδιο είδος εργασίας.
- **B12 Δικαίωμα εγγραφής:** business `resolveTarget` καλεί μόνο `requireContext`, όχι `requirePermission`, ενώ office ελέγχει `canWrite` (28–40). Χρειάζεται απομονωμένο negative test viewer πριν από διόρθωση. Δεν ισχυριζόμαστε πλήρη έλεγχο απομόνωσης οργανισμών.
- **B13 Λανθασμένος ισχυρισμός αποθήκευσης:** UI λέει «κρυπτογραφημένα», αλλά action κάνει `JSON.stringify` και `updateOrg` απευθείας. Δεν υπάρχει application-level encryption σε αυτή τη διαδρομή. Η τυχόν κρυπτογράφηση του υποκείμενου δίσκου δεν ελέγχθηκε.
- **B14 Οικονομική σημασιολογία dataset:** εξαιρούνται μόνο drafts, όχι cancelled/quotes· δεν μεταφέρεται invoiceType/status/currency και τα line totals μεταφέρονται χωρίς credit sign. Χρειάζονται fixtures ακυρωμένου, προσφοράς, πιστωτικού και ξένου νομίσματος, όχι αλλαγή ιστορικών εγγραφών.
- **U03 Cockpit διαφορετική πηγή πελατών:** `/office/cockpit` επαναχρησιμοποιεί legacy σελίδα που φορτώνει memberships αντί `firmClients`, ενώ `/office/bulk` χρησιμοποιεί firm-scoped clients. Δυνητικά διαφορετικές λίστες/πρόσβαση· θέλει test με staff/ανατεθειμένους πελάτες. Μην αφαιρέσετε οθόνη πριν ελεγχθούν οι ιδιαίτερες λειτουργίες της.

## UX ασυνέπειες / διπλές διαδρομές
- **U04** Προεπισκόπηση εισαγωγής δείχνει μόνο αριθμό, παρότι server επιστρέφει πέντε sample rows. Ο χρήστης δεν μπορεί να ελέγξει ποσά/αντιστοίχιση πριν δεσμευτεί (`card:43,79,176–181`).
- **U05** Elorus περιγράφεται «μόνο εισαγωγή» αλλά έχει badge «Εξαγωγή» (`index:51–57`, `card:240`).
- **U06** «Ζωντανό API» μαζί με «έρχεται στο επόμενο βήμα» και κουμπί «Αποστολή ζωντανά». Χρειάζεται μία σαφής κατάσταση: διαθέσιμη μορφή αρχείου / μη ρυθμισμένο / δοκιμασμένο sandbox / παραγωγή, χωρίς ψευδή συμβατότητα.
- **U07** Κοινή εργασία εισαγωγής υπάρχει σε entity-specific CSV dialog και bridge, αλλά με διαφορετική προεπισκόπηση, αναίρεση, αποδιπλοποίηση και validation. Πρόταση: κοινή ασφαλής μηχανή, όχι κατάργηση ορατών λειτουργιών.
- **U08** «Ειδοποιήσεις», «Λάθη & προσοχή», Cockpit και «Μαζικές ενέργειες» επικαλύπτονται, όχι κατ' ανάγκη ταυτίζονται. Προτείνεται κοινή πηγή ευρημάτων και deep links, με τις ξεχωριστές αναλυτικές οθόνες να παραμένουν.
- **U09** Υπάρχουν ακόμη αναφορές «Τιμολόγιο Cloud» στο onboarding ενώ το προϊόν λέγεται «Σύνολο ERP». Επιβεβαιωμένο οπτικά σε dashboard screenshots των παλαιών reports, παρότι τα filenames είχαν λανθασμένη ονομασία.
- **Πρόταση, όχι bug:** Στο mobile invoice editor η κάρτα συμβούλου ΕΦΚΑ προηγείται των πεδίων παραστατικού. Μεταφορά της σε δευτερεύουσα/πτυσσόμενη θέση για να μην εμποδίζει την κύρια εργασία.
- **Πρόταση, όχι bug:** Στο office bridge επαναλαμβάνεται όλη η επωνυμία σε sticky context και μεγάλο τίτλο. Μπορεί να συντομευτεί ο τίτλος χωρίς να χαθεί η υποχρεωτική ενεργή εταιρεία/ΑΦΜ.
- Δεν χαρακτηρίζουμε τις native αμερικανικές ημερομηνίες του αγγλόφωνου test browser ως καθολικό bug: η απόδοση date inputs εξαρτάται από locale.

## Απογραφή γεφυρών

| Σύστημα | Τι υπάρχει | Τι ΔΕΝ έχει αποδειχθεί / τι λείπει |
|---|---|---|
| SoftOne S1 | Login/authenticate/setData για πελάτες/προμηθευτές, JSON export | Χαρτογράφηση παραστατικών/λογιστικών άρθρων, ασφαλή record keys/upsert, error handling, επιτυχής sandbox εισαγωγή |
| Epsilon PYLON | Ουδέτερο ZIP/CSV και generic REST transport | Product/version-specific API/auth contract, Online Accounting εταιρική αντιστοίχιση, πραγματικό acceptance |
| Generic REST | POST του δικού μας dataset, optional X-API-Key | Σύμβαση payload/status/idempotency με συγκεκριμένο παραλήπτη· όχι καθολική συμβατότητα |
| Elorus | Εισαγωγή αρχείων, προηγούμενες επιτυχείς μετατροπές exports | Δεν υπάρχει live API γέφυρα και δεν ζητάμε να εφευρεθεί· απαιτούνται διορθώσεις parsing/consistency |
| myDATA | Πραγματικός ERP REST client με mock/dev/prod, timeout και XML parsing | Δεν είναι client αδειοδοτημένου δικού μας παρόχου. Δεν έγινε εξωτερική κλήση σε αυτόν τον γύρο |
| B2G | UBL generator + adapters simulation/generic/Impact/Epsilon/SoftOne/Cosmos/Retail@Link/Storm/Entersoft | Vendor contracts, XSD/Schematron/ελληνικό CIUS, sandbox acceptance. Παρακρατήσεις/χαρτόσημο παραμένουν gated/μη υποστηριζόμενα |
| ΕΡΓΑΝΗ | Credentials, payloads, REST, ιστορικό | Πλήρης επίσημη επαλήθευση ανά έντυπο και acceptance. Υπάρχουν LIVE ρυθμίσεις ακόμη και στη demo επιχείρηση: καμία δοκιμαστική υποβολή |
| Πληρωμές / e-shop | Προϋπάρχουν Stripe/Viva/IRIS/WooCommerce/Shopify κατά PRD | Δεν ελέγχθηκαν στον παρόντα στοχευμένο γύρο· να απογραφούν χωριστά αν ο όρος «όλες οι γέφυρες» περιλαμβάνει και αυτά |

Read-only DB: 6 οργανισμοί, καμία αποθηκευμένη live SoftOne/Epsilon σύνδεση με credentials. B2G επιλεγμένο simulation, myDATA mock σε 4 / prod σε 2. Αυτές είναι ρυθμίσεις preview, όχι διαπίστωση παραγωγής.

## Γρήγορη σειρά υλοποίησης — ΜΟΝΟ μετά έγκριση
1. **Ακρίβεια εισαγωγής:** locale ποσών και rate→VAT code. Test: `1.234,56`, `1234.56`, `100,00`, άκυρη τιμή, ΦΠΑ24→1 και invoice validation.
2. **Ασφαλείς επιλογές εξαγωγής:** κανένα/ένα/όλα, υποστηριζόμενες SoftOne οντότητες. Test: actual HTTP output και ίδιο UI σε business/office· unsupported mapping σαφώς αποκλεισμένο, όχι ψεύτικο vendor payload.
3. **Ειλικρινή αποτελέσματα αποστολής:** αποτυχημένο authenticate, μερική/ολική απόρριψη, timeout, malformed response. Test: offline contract fixtures χωρίς πραγματικές αποστολές· idempotent retries μόνο με επιβεβαιωμένο vendor contract.
4. **Ασφαλής εισαγωγή:** sample rows, υπάρχοντα πεδία, dedup, viewer denial. Test: προσωρινή βάση/απομονωμένος tenant, επανάληψη αρχείου και rollback. Καμία μεταβολή δεδομένων χρήστη.
5. **UX λογιστή:** σωστά alerts ανά τύπο, link στη συγκεκριμένη εταιρεία/εγγραφή, κοινή ορολογία/branding, προαιρετική συμπύκνωση επαναλήψεων. Test: προσφορά δεν ζητά διαβίβαση, διόρθωση κρατά tenant, desktop/mobile και permissions.
6. **Ανά πάροχο sandbox:** επίσημα metadata/δείγματα + sandbox, συμφωνία πλήθους/ποσών/IDs. Μία γέφυρα κάθε φορά, όχι ταυτόχρονο υποτιθέμενο «όλα live».
7. **Δικός μας πάροχος:** ξεχωριστό `PROVIDER_READINESS.md`. Καμία δήλωση αδειοδότησης χωρίς ΑΑΔΕ.

Μετά το πρώτο πακέτο επαναχρησιμοποιούνται τα ίδια assertions και ελέγχονται μόνο οι επηρεαζόμενες ροές. Όχι νέο γενικό audit σε κάθε διόρθωση. Μεγάλο refactor invoice-editor δεν χρειάζεται τώρα.

## Αποδεικτικά και διορθώσεις αναφορών
- `test_reports/iteration_43.json`: αρχική αναφορά· οι ισχυρισμοί 26/26 desktop, 4/4 mobile και screenshots δεν τεκμηριώθηκαν και ΔΕΝ υιοθετούνται.
- `test_reports/iteration_44.json`: διορθώνει τα offline tests σε 3/10 PASS, 7 FAIL. Οι τέσσερις εικόνες που αποκάλεσε bridge είναι στην πραγματικότητα dashboards. ΔΕΝ τεκμηριώνουν bridge UX ή διπλό office banner.
- `frontend/tests/bridge_offline_diag.mjs`, `test_reports/iter43/bridge_offline_diag.log`: έγκυρο offline αποδεικτικό. Η VAT assertion ελέγχει εύρος1–8, όχι ακόμη ακριβώς1· πριν από regression να γίνει αυστηρή για κάθε rate.
- Ανεξάρτητες σωστές main browser λήψεις εμφανίστηκαν στη συνομιλία: `actual_business_bridge_desktop.jpeg`, `actual_business_bridge_mobile.jpeg`, `actual_invoice_new_mobile.jpeg`, `actual_office_bridge_desktop.jpeg`, `actual_office_bridge_mobile.jpeg`, `actual_office_alerts_mobile.jpeg`. Είναι artifacts απομακρυσμένου browser `/tmp`, ΟΧΙ τοπικά αρχεία `/app`. Δεν δίνουμε ανύπαρκτα download links.
- Πραγματικά τοπικά console logs: `test_reports/verified_backoffice/console_20260915_045350.log` και `console_20260915_045359.log`.

Κατάσταση: **B01–B14, U01, U02, U04–U06 διορθώθηκαν (iteration_45 PASS)**. Ανοιχτά: U03, U07, U08, U09, vendor sandbox. Το ευρύ UX audit δεν θεωρείται ολοκληρωμένο.
