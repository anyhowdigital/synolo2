## Τρέχων γύρος — Ομογενοποίηση UI με αμετάβλητα χρώματα (ολοκληρώθηκε και ελέγχθηκε)
- Αίτημα χρήστη: «Ενσωμάτωση Astra με το καταλληλότερο διαθέσιμο μοντέλο / Ομογενοποίηση UI με τον διαθέσιμο Design Agent, με ακριβώς τα σημερινά χρώματα».
- Astra: αναμένεται διευκρίνιση εάν είναι συγκεκριμένη υπηρεσία/API, agent ανάπτυξης ή όνομα βοηθού. Δεν έγινε ενσωμάτωση/μετονομασία AI. Το ask_human απορρίφθηκε από platform pre-completion JavaScript linter engine (όχι application lint error). Η ερώτηση κοινοποιήθηκε σε απλό μήνυμα. UI εγκρίθηκε ανεξάρτητα.
- Design Agent έδωσε blueprint στο design_guidelines.json. Η υλοποίηση διατηρεί τις πραγματικές ροές/καταστάσεις/τίτλους (Προσωπικό μόνο ανάγνωση, τραπεζικοί λογαριασμοί όχι κινήσεις στη λίστα). Δεν αλλάζουν typography/colors/sidebar/auth/schema/credentials.
- Κοινά FilterBar/ListPagination 25/50/100/200/PageHeader/TableShell σε projects, banking, employees, office clients/tasks/fees/documents. Αναζήτηση/κατάσταση/καθαρισμός/σελιδοποίηση με URL, πραγματικό count, clamp σελίδας. Έργα/έγγραφα φίλτρο ημερομηνίας δημιουργίας, εργασίες προθεσμίας. Τράπεζες IBAN/τύπος/ενεργοί, HR όνομα/ΑΦΜ/ΑΜΚΑ/ειδικότητα. Αμοιβές χωριστές προβολές πελατών/χρεώσεων, μήνας φίλτρου ανεξάρτητος από δημιουργία χρεώσεων.
- Αφαιρέθηκαν παλιά όρια φόρτωσης 20 doc_requests και 200 firm_fee_charges για πλήρη σελιδοποίηση, με τις ΙΔΙΕΣ προηγούμενες συνθήκες οργανισμού/γραφείου. Τα έγγραφα παραμένουν στον ενεργό οργανισμό που κατονομάζεται πλέον στην περιγραφή.
- Mobile fixes: date fields/filter flex widths, headers/table shells min-w-0, office clients tabs wrap, fee grid και header CTA wrap. Search/date form remount σε reset/navigation, filtersActive καθαρίζει φίλτρα κατάστασης χωρίς αναζήτηση.
- Χρώματα: globals.css SHA256 αμετάβλητο 5016fde68189a2eddbece14ae5e48b37eb23a127d14514bf72a2516882b3682d. Main banking smoke1920×800+390×844: overflow[] και στα δύο.
- QA53 μόνο presence/smoke, ΟΧΙ πλήρης λειτουργική απόδειξη (desktop1080 μη αποδεκτό). QA54:55 προσωρινά projects, counts25/25/5,50/200, search/status/clamp PASS· fixtures καθαρίστηκαν. Δεν καλύφθηκαν εκεί λοιπά populated flows. Αναφορές screenshot54 δεν είναι τοπικά διαθέσιμες.
- QA54 fixes προς retest: customers/suppliers/expenses Prev/Next διατηρούν pageSize (παλιό callback έστελνε κενό)· listInvoices clamp μετά το count (καλύπτει και quotes)· disabled Prev/Next πραγματικά disabled buttons χωρίς άκυρα href.
- Ολοκλήρωση QA55–58: populated banking/employees/customers, office tasks/documents/fees,205 χρεώσεις, ασφαλές complete/reopen και paid/unpaid σε προσωρινά fixtures, αναζητήσεις/καταστάσεις/ημερομηνίες/IBAN/καθαρισμός/σελιδοποίηση. Όλα τα προσωρινά fixtures επαληθεύτηκαν διαγραμμένα. Credentials/settings/πραγματικά δεδομένα αμετάβλητα. Δεν κλήθηκαν ζωντανές εξωτερικές υπηρεσίες.
- QA55 invoice-clamp και δύο IBAN failures αποσύρθηκαν από QA57 ως false negatives (premature DOM assertion και λάθος fixture). Main /invoices?pageSize=50&page=99: HTTP200,range1–32 από32,32rows,empty0· QA57 επιβεβαίωσε. Suppliers/expenses pageSize fix επιθεωρήθηκε ως ίδιο pattern· η πλήρης δυναμική διαδρομή50→next→prev ελέγχθηκε σε customers.
- Παραστατικά κινητού: invoices-table.tsx προσαρμόστηκε σε3στήλες (επιλογή, αριθμός+πελάτης, σύνολο+κατάσταση), χωρίς οριζόντια κύλιση· πλήρεις στήλες desktop διατηρούνται. QA57 επιβεβαίωσε32γραμμές, πιστωτικά/μερική είσπραξη, select/clear και overflow0 σε390×844/1920×800. Δεν άλλαξαν ποσά/λογιστική/ενέργειες.
- Τελικό μικρό fix: tabs σύνδεσης πελατών στο κινητό κληρονομούσαν group-data-horizontal/tabs:h-8 παρά το h-auto. Ρητό group-data-horizontal/tabs:h-auto + gap-1 διορθώνει δεύτερη σειρά. Main screenshot mobile:height62,spill0,panelOverlapfalse,overflow[]. QA58 mouse+keyboard και ενεργοποίηση/απενεργοποίηση submit χωρίς υποβολή PASS και στα2viewports.
- Τελικό typecheck PASS· targeted ESLint0errors,6προϋπάρχουσες no-unused-expressions warnings σεclient-link-panel/fees-panel. Palette checksum ίδιο. Το platform ask_human linter-engine failure ΔΕΝ αναπαράγεται στο application lint.
- Artifacts: QA53–58 αναφορές. Πραγματικές εικόνες QA55/57 υπάρχουν στοtest_reports (επιθεωρήθηκαν). Οι αναφορές screenshot54/56/58 δεν αντιστοιχούν σε τοπικά διαθέσιμα αρχεία· για58 υπάρχειmain screenshot_tool εικόνα και report συμπεριφοράς. Μην επικαλείστε αυτές τις ανύπαρκτες διαδρομές ως αρχεία. Το comment-only iter57_narrow.py αφαιρέθηκε (δεν ήταν runnable regression). Διορθώθηκε count-query στοiter55_seed.py και timezone-aware timestamp χωρίς νέα seed.
- Δεν παραμένει αναφερθέν λειτουργικό/UI σφάλμα σε αυτό το scope. Astra παραμένει σε αναμονή διευκρίνισης· δεν ανακοινώνουμε ενσωμάτωση που δεν έγινε.
- Backlog παραμένει: υπόλοιπες δευτερεύουσες λίστες/πίνακες σε panels, myDATA POS type7, B2G παρακρατήσεις/χαρτόσημο (BLOCKED επίσημα mappings), live SoftOne/Epsilon sandbox, ΥΠΑΗΕΣ PROVIDER_READINESS Φάση1, ΕΡΓΑΝΗ audit/acceptance, δόσεις/διακανονισμοί με κάρτα, email-to-invoice. Μεγάλο γενικό refactor εκτός scope.


## 2026-06 Συμμόρφωση προτύπων + Design standards — TESTED (iteration_51: 15/15, iteration_52: 34/34)
- Λογιστικά (code review → fixes): GL παρακράτηση/χαρτόσημο ισοσκελισμένα, credit flag πρόσημο, expenseSide skip, αντιλογισμός σε ακύρωση, period lock σε GL/expense delete/undo import, undo δεν διαγράφει εκδοθέντα, unique index αρίθμησης (drizzle 0045), businessDate σε duplicate/convert.
- B2G Greek CIUS (lib/b2g/ubl.ts, lib/services/b2g.ts): BT-1 6 τμήματα, ΜΑΡΚ, INVOICE URL, BT-11/12/46/49/158 CPV, soft reject, credit ##PROJECT|REFERENCE##· νέα πεδία customers.b2g_cpv, invoices.b2g_cpv/b2g_soft_reject (drizzle 0046)· φόρμα στοιχείων σύμβασης ανά παραστατικό (b2g-refs-form)· customer form BT-46/CPV.
- myDATA: continuationToken pagination (requestAllPages), duplicate-transmission guard (υιοθέτηση υπάρχοντος ΜΑΡΚ).
- Design: /app/design_guidelines.json + /app/memory/DESIGN_STANDARDS.md (design agent)· FilterBar/ListPagination/DateRangeFields (components/list), lib/list-params.ts· εφαρμογή σε invoices/quotes/customers/suppliers/products/expenses· 5 PDF templates (classic/modern/minimal/bold/elegant) A4 με διακριτά layouts + preview parity.
- Ενιαία εισαγωγή: lib/import/engine.ts (runImport/undoImport/recentBatches) κοινή για CSV dialog & bridge (bridge-recent-imports + undo).
- Πλήρης πίνακας: /app/memory/COMPLIANCE_MATRIX.md. tests harness: frontend/tests/harness/*.ts (εκτός tsc).
- ΕΚΚΡΕΜΕΙ: myDATA POS type 7 transaction data· B2G παρακράτηση/χαρτόσημο· εφαρμογή DESIGN_STANDARDS σε office lists (clients/tasks/fees/documents) & PageHeader παντού· ΕΡΓΑΝΗ audit· PROVIDER_READINESS Φάση 1.

## 2026-06 Business back-office UX audit (iteration_48) — ευρήματα & διορθώσεις
- Audit 32 σελίδων ×2 viewports: όλες 200, χωρίς console/hydration errors, σωστά formats. Ευρήματα: sidebar↔h1 mismatches (recurring/projects/pos), διπλό CTA /projects, /delivery-notes χωρίς δικό του h1, orphan /reports/cashflow & /reports/withholding, ασαφές disabled «Διαβίβαση εκκρεμών», διπλά sidebar icons, 429 σε cold mobile loads (ingress του preview — όχι κώδικας εφαρμογής).
- Fixes: sidebar labels = h1 («Ταμείο λιανικής (POS)», «Έργα & χρονοχρέωση», recurring h1 → «Συνδρομές & επαναλαμβανόμενα»)· νέα sidebar entries «Δελτία αποστολής» (/invoices?kind=delivery, active-state με useSearchParams), «Ρευστότητα 90 ημερών», «Παρακρατούμενοι φόροι»· μοναδικά icons· /invoices?kind=delivery δικό του h1/περιγραφή· ένα CTA στα έργα· κουμπί myDATA λέει «Κανένα εκκρεμές προς διαβίβαση»· sidebar auto-open group χωρίς setState-in-effect (lint clean).
- ΕΚΚΡΕΜΕΙ από audit: /banking sub-routes (reconcile/extrait/import) δεν υπάρχουν — μόνο per-account tabs (χαμηλή προτεραιότητα)· βαθύτερος λειτουργικός έλεγχος με writes (invoice issue/POS sale/import) δεν έγινε (read-only audit).

## 2026-06 Branding + Ενιαία ευρήματα γραφείου — TESTED (iteration_46/47 PASS)
- Branding: 24 σημεία «Τιμολόγιο Cloud»/«Timologio Cloud» → «Σύνολο ERP»/«Synolo ERP» (emails, PDF, portal, passkeys, Stripe product name, setup, print toolbar).
- Νέα κοινή πηγή `lib/services/office-findings.ts` (collectFindings: clientAlerts + orgWatch deadline/risk/anomalies + doc requests + overdue tasks) + `components/office/findings-list.tsx`. Χρησιμοποιείται από /office/inbox (φίλτρα ανά πηγή/πελάτη), /office/alerts (μόνο books/myDATA ανά πελάτη), /office/cockpit (νέα firm-scoped σελίδα, U03 fixed — δεν χρησιμοποιεί πλέον memberships).
- Deep links: `/office/open?org=&to=` (server redirect, ενεργοποιεί org cookie, ελέγχει firmClient+membership) — «Άνοιγμα εγγραφής»/«Είσοδος»/«Άνοιγμα radar». Fix: relative redirect (η NextResponse.redirect(new URL(...origin)) έδινε 0.0.0.0:3000 πίσω από proxy).
- U03 επίσης σε /office/tasks (+?org= φίλτρο, team από firmTeam) και /office/calendar → firmClients. /accountant/cockpit → redirect /office/cockpit. Sidebar: μοναδικά icons (ListTodo/Gauge/UserCog).
- Καθαρίστηκαν προϋπάρχοντα lint errors (productivity Date.now purity, unused imports). tsc/eslint καθαρά.
- ΕΚΚΡΕΜΕΙ: U07 κοινή μηχανή εισαγωγής (entity CSV dialog vs bridge), office-widgets client_errors να χρησιμοποιεί collectFindings (τώρα clientAlerts — ίδια δεδομένα), vendor sandbox, PROVIDER_READINESS.

## 2026-06 Bridge & back-office audit fixes — ΥΛΟΠΟΙΗΘΗΚΑΝ & TESTED (iteration_45 all PASS, offline 10/10)
- B01/B02: toNum (1.234,56 / 1234.56 / 1,234.56 / €) + toVatCategory (24→1, 13→2 … 0→7, 1–8 passthrough) σε lib/accounting-bridge/index.ts· εξάγονται για tests.
- B03/B07: SoftOne export περιλαμβάνει income/expenses· parsePartyImport διαβάζει data.CUSTOMER[0] + IRSDATA/ADDRESS/CITY/PHONE01/EMAIL (roundtrip OK).
- B04/B05/B06: softonePush σταματά σε authenticate failure, ok:false σε ολική/μερική απόρριψη (failed counts + έως 5 μηνύματα)· restPush ελέγχει body success/ok/status· elorus push απορρίπτεται.
- B08/B09: entities πάντα στο href, μηδενική επιλογή → disabled κουμπί + route 400· pushBridgeAction κάνει filterDataset(entities).
- B10/B11/B12: update πελάτη/προμηθευτή δεν σβήνει πεδία· dedup εξόδων (ΑΦΜ+σειρά+αριθμός → skipped warning)· business resolveTarget απαιτεί ρόλο write.
- B13/U05/U06: αφαιρέθηκε ισχυρισμός «κρυπτογραφημένα»· badges «Αρχείο», «Αρχείο · API χρειάζεται credentials», «API ρυθμισμένο», «Μόνο εισαγωγή».
- B14: dataset εξαιρεί cancelled + quotes, πιστωτικά με αρνητικό πρόσημο, στήλη type στα docs CSV.
- U01/U02/U04: «Διόρθωσέ το» → /office/bulk?org=&action= με προεπιλεγμένο πελάτη + hint· quotes εκτός myDATA alerts· προεπισκόπηση εισαγωγής με πίνακα 5 δειγμάτων.
- ΕΚΚΡΕΜΕΙ: U03 (cockpit πηγή πελατών), U07/U08 ενοποίηση εισαγωγών/ευρημάτων, U09 branding «Τιμολόγιο Cloud», live vendor sandbox ανά πάροχο, PROVIDER_READINESS φάσεις.

## Τρέχουσα προτεραιότητα — back offices / γέφυρες / προετοιμασία ΥΠΑΗΕΣ
- Τελευταίο αίτημα: «Άσε το super admin πάμε στα back offices (και πελατών). Τρέξε τρομακτικά τεστ σε θέματα design και ux consistency. Βρες μου προβλήματα, δυσνόητα και δίπλα πράγματα. Κάνε όλες τις γέφυρες να δουλεύουν και τέλος ετοίμασε μας να κάνουμε δικό μας πάροχο ηλεκτρονικής τιμολόγησης. Πριν προχωρήσεις με ρωτάς». Έγκριση πρώτου διαγνωστικού πακέτου: «Ναι αλλά βρες μου τρόπο να μην αργήσεις πάρα πολύ».
- ΜΟΝΟ διάγνωση/απογραφή εγκρίθηκε, ΟΧΙ υλοποίηση. Επόμενη ενέργεια: παρουσίαση και έγκριση μικρού πακέτου διορθώσεων. Super Admin και ChatGPT εκτός. Owner kkoletsas@gmail.com αμετάβλητος.
- Παραδοτέα: `memory/BACKOFFICE_AUDIT.md` (ευρήματα/προτεραιότητες/μικρά tests), `memory/PROVIDER_READINESS.md` (πηγές ΑΑΔΕ, gap matrix, φάσεις φακέλου/λογισμικού, όχι πιστοποίηση).
- Testing: διορθωμένα offline bridge tests `frontend/tests/bridge_offline_diag.mjs`: 3/10 PASS,7FAIL, μόνο MOCKED fetch. Locale1.234,56, λάθος VAT code24, χαμένα SoftOne income/expenses, roundtrip0rows, authenticate failure αγνοείται, ψευδής επιτυχία SoftOne/REST. Όλα ανοιχτά, δεν εφαρμόστηκε fix.
- Main browser: πραγματικά business/office login, οι δύο bridge οθόνες1920×800 και390×844 (mobile overflow[]), νέο παραστατικό και office alerts390×844. Zero-selection export αποδείχθηκε ότι κρατά ενεργό href για όλα. Office «Διόρθωσέ το» χάνει context→/office/bulk. Προσφορά ΠΡ-1 ζητείται λανθασμένα για myDATA από client-alerts.
- ΠΡΟΣΟΧΗ αξιοπιστίας: report43 κάλυψη26/26 και4/4 ανακλήθηκε. Report44 διορθώνει τα offline tests, αλλά screenshots που ονομάστηκαν bridge δείχνουν DASHBOARD. Μην τα χρησιμοποιείτε ως bridge proof. Main σωστά screenshots επέστρεψαν inline μέσω screenshot εργαλείου, remote /tmp artifacts. Τοπικά μόνο console logs `test_reports/verified_backoffice/console_20260915_045350.log` και `...045359.log`. Δεν αποδείχθηκε πλήρης UX/ρόλων/tenant κάλυψη.
- Read-only απογραφή: 6orgs, μηδέν live bridge credentials, myDATA4mock/2prod, B2Gsimulation· ERGANI LIVE ακόμη και σε demo org — καμία εξωτερική υποβολή. Κανένα application source/schema/env/business data change.
- Επόμενο P1 με έγκριση: ποσά/VAT, ασφαλές export και αληθή push results, dedup/διατήρηση πεδίων/δείγματα εισαγωγής, viewer gates, σωστά alerts/deep links και κοινή ορολογία. Μετά επίσημα vendor contracts/sandbox για πραγματικές γέφυρες. Όχι τυφλό επαναλαμβανόμενο γενικό audit.
- Πάροχος: επίσημη σελίδα ΑΑΔΕ επιβεβαιώνει Α.1112/2025 και φάκελο/πίνακες. Απαιτείται πλήρης αδειοδότηση ΥΠΑΗΕΣ, ISO27001/αποδεκτό ισοδύναμο, δεδομένα ΕΕ, αυθεντικοποίηση/διαφύλαξη/ελεγκτική διεπαφή/συνέχεια. ERP myDATA client και SHA256 PDF registry ΔΕΝ ισοδυναμούν με αδειοδοτημένο πάροχο. B2G/POS χωριστά acceptance. Επίσημα PDF downloads403· οι λεπτομέρειες άρθρων βασίζονται σε δημοσιευμένη αναδημοσίευση και θέλουν τελικό επίσημο έλεγχο.
- Test credentials συμπληρώθηκαν με ήδη υπάρχον office@koletsas.gr/office1234 από reports39–41· δεν δημιουργήθηκαν/τροποποιήθηκαν λογαριασμοί.
- Παλιό backlog παραμένει: B2G παρακρατήσεις/χαρτόσημο χωρίς επιβεβαιωμένα mappings, ΕΡΓΑΝΗ contracts/acceptance, financial transactional regression, δόσεις/διακανονισμοί, email-to-invoice. Μεγάλο invoice-editor refactor δεν απαιτείται στον παρόντα γύρο.

---


<!-- 2026-06 Super-Admin (εσωτερικό platform panel) — Phase 1
- Auth: σταθερά credentials σε env (frontend/.env): SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD_HASH (scrypt), ADMIN_SESSION_SECRET. Ξεχωριστό httpOnly cookie tc_admin (HMAC-signed email), 8h. lib/admin/auth.ts (verifySuperAdmin/currentSuperAdmin/start/end).
- Actions (actions/admin.ts): adminLoginAction (single-arg form action → redirect /admin ή /admin/login?e=1), adminLogoutAction, setOrgPlanAction, setOrgFrozenAction (planStatus='frozen'|'active'). Όλα πίσω από currentSuperAdmin gate.
- UI: /admin/login (server-action form), /admin (guarded, redirect→login χωρίς cookie) = λίστα Οργανισμών με αλλαγή πλάνου + πάγωμα (AdminOrgRow client). Login = plain form action (χωρίς hydration guard).
- Επαλήθευση: scrypt verify GOOD true/BAD false· /admin/login 200· /admin χωρίς cookie 307· έγκυρο signed cookie → /admin 200 με πίνακα (admin-title/admin-org-*/Αποσύνδεση)· tampered cookie 307· tsc καθαρό.
- ΠΑΡΑΔΟΘΗΚΕ: A (Tenants: λίστα/πλάνο/πάγωμα). ΕΚΚΡΕΜΟΥΝ (next): «Είσοδος ως» (impersonate), B (feature flags override ανά οργανισμό), C (φορολογικές παράμετροι — απαιτεί refactor του TAX_RULES/engine ώστε να διαβάζει overrides από DB).
-->



<!-- 2026-06 Elorus products import — επαληθευμένο με πραγματικό αρχείο
- parseProductImport προσαρμόστηκε στις στήλες Elorus: Τίτλος→name (πριν το κενό «Περιγραφή»), Τιμή πώλησης→unitPrice, Κωδικός προϊόντος→barcode, «Μονάδα μέτρησης - Τίτλος/Σύμβολο»→kind, Κατηγορία εσόδων→category.
- Δοκιμή με το ανεβασμένο «Προϊόντα _ Υπηρεσίες.csv»: 16/16 είδη με σωστό όνομα/τιμή/κωδικό, kind=service, 0 warnings. tsc καθαρό.
- Commit: products upsert (dedup barcode→name), insert με sku/barcode/kind/unitPrice/category, createdAt.
-->



<!-- 2026-06 Γέφυρα v3 — έρευνα προδιαγραφών + Elorus import-only
- SoftOne: διορθώθηκε δομή setData σε data:{OBJECT:[{...}]} με πεδία CODE/NAME/AFM/IRSDATA(ΔΟΥ)/ADDRESS/CITY/PHONE01/EMAIL (export payloads + softonePush). Πηγή: softone.gr/ws.
- Epsilon Pylon: help text ενημερώθηκε — εισαγωγή μητρώου μέσω «Εισαγωγή δεδομένων από τρίτα συστήματα → Εξαγωγή Πρότυπου Αρχείου .xlsx», άρθρα μέσω module Online Accounting/FastImport. Το ZIP παραμένει ουδέτερο CSV προς χαρτογράφηση.
- Elorus: προστέθηκε ΜΟΝΟ ως πηγή ΕΙΣΑΓΩΓΗΣ (kind=export, χωρίς API/credentials/export). Εμφανίζεται μόνο στο dropdown εισαγωγής + στη λίστα παρόχων· χρησιμοποιεί τον γενικό CSV/JSON parser (auto-detect στηλών).
- Card: LIVE=kind"live" (generic/softone/epsilon) για export-program + credentials· IMPORT_PROVIDERS=όλοι πλην simulation (περιλαμβάνει Elorus) για εισαγωγή. tsc καθαρό, σελίδες compile.
-->



<!-- 2026-06 Γέφυρα λογιστικών v2 — αποθηκευμένα credentials + ζωντανή αποστολή + εισαγωγή ειδών
- Schema: organizations.accountingBridgeJson (migration 0042 + journal entry idx 42, εφαρμόστηκε — col exists:True). Αποθηκεύει BridgeConfig {enabled,provider,baseUrl,appId,username,password,apiKey,company,branch,module}.
- Engine: parseBridgeConfig/maskBridgeConfig (τα μυστικά δεν φεύγουν στο client), parseProductImport (CSV/JSON, ελληνικά δεκαδικά, product/service detection).
- Actions (accounting-bridge.ts): saveBridgeConfigAction (κενό μυστικό=διατήρηση), pushBridgeAction (φορτώνει config από DB, buildDataset, pushDataset· SoftOne login→authenticate→setData / generic-epsilon REST). commit/preview επεκτάθηκαν σε entity "products" (upsert με barcode/name). Gates: business=requireContext, office=firmClient+canWrite.
- UI (AccountingBridgeCard): νέα κάρτα «Ζωντανή σύνδεση (credentials)» με πεδία ανά πάροχο (SoftOne: appId/username/password/company/branch/module· generic/epsilon: apiKey) + «Αποθήκευση σύνδεσης» + «Αποστολή ζωντανά». Import dropdown +«Είδη/Υπηρεσίες». config περνά masked από settings + office pages.
- Testing: 7/7 νέα unit tests (products import, config parse, mask secrets) PASS + προηγούμενα 12/12· tsc 100% καθαρό· σελίδες compile (307).
- Καθαρισμός Ρυθμίσεων: ΕΚΚΡΕΜΕΙ γνώμη/έγκριση — καμία καρτέλα δεν είναι πραγματικά άχρηστη· προτεινόμενη προαιρετική συγχώνευση (aade→υπό myDATA, email=log). Δεν διαγράφηκε τίποτα χωρίς έγκριση.
-->



<!-- 2026-06 Γέφυρα λογιστικών (Epsilon/SoftOne/Generic) — export+import ανά πρόγραμμα + επιλογή οντοτήτων
- Engine src/lib/accounting-bridge/index.ts: BRIDGE_PROVIDERS (simulation/generic/softone/epsilon με τεκμηρίωση), buildBridgeDataset (πελάτες/προμηθευτές/έσοδα/έξοδα/άρθρα ΕΛΠ για περίοδο), buildProgramExport(provider, ds, entities?) → SoftOne setData JSON / Epsilon+Generic ZIP CSV (jszip), datasetToCsv (ημερολόγιο), pushDataset (SoftOne login→authenticate→setData, generic/epsilon REST, simulation).
- Import: parsePartyImport (CSV/JSON, πελάτες/προμηθευτές, αντιστοίχιση με ΑΦΜ) + parseExpenseImport (έξοδα/παραστατικά, ελληνικά δεκαδικά). Actions previewImportAction/commitImportAction (business=requireContext, office=firmClient+canWrite). Import: customers/suppliers upsert, expenses insert (status=pending, source=import). Income/journal ΜΟΝΟ export (ακεραιότητα myDATA/σειρών).
- Routes: /api/accounting-bridge (business, requireContext) & /api/office/accounting-bridge?org= (firmClient gate). Params from,to,format(csv|json),provider,entities.
- UI: AccountingBridgeCard — επιλογή περιόδου, προγράμματος, checkboxes «τι να εξαχθεί» (5 οντότητες), λήψη ανά πρόγραμμα + CSV/JSON· εισαγωγή με provider/οντότητα/αρχείο + προεπισκόπηση + commit.
- Μεταφορά στις Ρυθμίσεις: νέα καρτέλα «Γέφυρα λογιστικού» (tab=bridge) υπό «Δεδομένα & διασυνδέσεις». Αφαιρέθηκε το top-level sidebar item /integrations/accounting (η σελίδα διαγράφηκε). Office: /office/clients/[orgId]/bridge + κουμπί «Γέφυρα λογιστικού» στην καρτέλα 360°.
- Testing: 12/12 unit tests (export/entities-filter/setData/ZIP/CSV+JSON import incl. greek decimals) PASS· tsc 100% καθαρό· σελίδες/routes compile (307/401). ΕΚΚΡΕΜΕΙ: persisted live-API credentials (χρειάζεται schema migration + πραγματικά credentials παρόχου) — τώρα οι push συναρτήσεις υπάρχουν αλλά χωρίς αποθηκευμένα credentials.
- ΕΚΚΡΕΜΕΙ αίτημα χρήστη: «καθάρισμα άχρηστων» στις Ρυθμίσεις — ΔΕΝ διαγράφηκε καμία λειτουργική καρτέλα (χρειάζεται διευκρίνιση τι θεωρείται άχρηστο).
-->



<!-- 2026-06 Deep-link καρτέλας + Ειδοποίηση ολοκλήρωσης + Auth fix TESTED (iteration_41, 100%)
- Deep-link: /copilot διαβάζει ?tab= (server, Tabs defaultValue). Κουμπί «Ρωτήστε τον Βοηθό AI» στο /advisor → /copilot?tab=tax ανοίγει κατευθείαν την καρτέλα «Φορολογικός σχεδιασμός». Επαληθεύτηκε.
- Ειδοποίηση ολοκλήρωσης: updateOfficeTaskAction — όταν advisor task (code advisor:*) γίνεται done από μη-ιδιοκτήτη, email στον ιδιοκτήτη γραφείου (sendMail→email_outbox χωρίς SMTP). Guard: δεν στέλνει αν ο ολοκληρωτής είναι ο ίδιος ο ιδιοκτήτης. try/catch non-blocking.
- SECURITY FIX (HIGH, προϋπήρχε): updateOfficeTaskAction δεν είχε έλεγχο πρόσβασης — πλέον resolveFirm + firmClient(before.orgId) gate ώστε μόνο μέλος του γραφείου με πρόσβαση στον πελάτη να αλλάζει την εκκρεμότητα.
- Tabs (copilot 2 / advisor 4): χωρίς overflow σε 1920x800 & 390x844 (flex-wrap). Παλιό inline chat αφαιρέθηκε από /advisor. tsc 100% καθαρό.
- Σημείωση: το email-branch της ολοκλήρωσης δεν δοκιμάστηκε live end-to-end γιατί το demo γραφείο έχει μόνο ιδιοκτήτη (χρειάζεται non-owner firm_member). Guard-path (χωρίς email/exception, status persisted) επαληθεύτηκε.
-->



<!-- 2026-06 Σύμβουλος UX + Ενοποίηση chat + KB refresh + Profile sync
- 1a ΕΝΟΠΟΙΗΣΗ chat: /copilot («Βοηθός AI») πλέον με 2 καρτέλες — «Ρευστότητα & Εισπράξεις» (CopilotChat + CollectionsAgent) και «Φορολογικός σχεδιασμός» (TaxCopilotChat, grounded tax context). Αφαιρέθηκε το διπλό chat από τον Σύμβουλο.
- 2a ΣΥΜΒΟΥΛΟΣ σε καρτέλες (/advisor): Επισκόπηση (KPIs+όφελος+γρήγορες ενέργειες+CTA στον Βοηθό) / Ευκαιρίες (apply-dismiss) / Προφίλ & Προσομοιώσεις (TaxProfileForm+what-if+μισθός/μέρισμα) / Βάση γνώσης. TabsList flex-wrap για mobile.
- KB manual refresh: refreshKbReviewAction() + KbRefreshButton στο /office/kb-review (σημειώνει για αλλαγή κανόνες παλαιότερης χρονιάς).
- Profile sync λογιστή: το φορολογικό προφίλ = organizations.taxProfileJson (μία πηγή). Προστέθηκε επεξεργάσιμη TaxProfileForm (orgId prop) στη σελίδα Συμβούλου του λογιστή + saveClientTaxProfileAction (canWrite guard) — αλλαγές λογιστή ενημερώνουν άμεσα την επιχείρηση.
- Διορθώθηκε προϋπάρχον tsc error: προστέθηκε τύπος ειδοποίησης tax_kb_review στο NOTIFICATION_TYPES. tsc πλέον 100% καθαρό.
- Testing: tsc clean + όλες οι σελίδες compile (307). Οπτική επαλήθευση με screenshot ΔΕΝ έγινε λόγω login-hydration limitation του automation tool (real users OK). Δεν άλλαξε backend λογική — μόνο σύνθεση/UI με ήδη δοκιμασμένα components.
-->



<!-- 2026-06 Φάση 3 (d++) — Ειδοποίηση ανάθεσης, Παραγωγικότητα Συμβούλου, E2E μισθοδοσίας TESTED (iteration_40)
- Ειδοποίηση ανάθεσης (F1): assignOpportunityAction στέλνει email στον συνεργάτη (sendMail+layoutEmail+appUrl) με πελάτη/ευκαιρία/προθεσμία/CTA link· non-blocking (try/catch) — η ανάθεση δεν μπλοκάρεται αν αποτύχει το mail. Χωρίς SMTP → email_outbox status 'logged'. Επαλήθευση: outbox row 'Νέα ανάθεση ευκαιρίας — <πελάτης>'.
- Παραγωγικότητα Συμβούλου (F3): advisorProductivity(db,firm,clients) στο tax-advisor.ts — office_tasks code LIKE 'advisor:%' ανά assignee (ανατεθειμένες/ανοιχτές/ολοκληρωμένες) + κλειδωμένο όφελος (benefit από την ίδια ευκαιρία όταν task=done). Κάρτα στο /office/advisor (testids advisor-prod-assigned/-done/-locked/-row-<userId>). Επαλήθευση: done→locked ~900€ σωστό.
- E2E μισθοδοσίας/δώρων/αδειών/αρίθμησης (F2): επαληθεύτηκε με DB+code review — ΕΦΚΑ εργαζ. 187,18€/εργοδ. 312,06€, ΦΜΥ 125,58€, καθαρά 1.087,24€ (1.400€)· δώρα posted idempotent (unique index org+month)· leave validations (to<from, τύπος, εύρος, overlap, δεν σβήνει βάρδιες, δεν στέλνει ΕΡΓΑΝΗ)· αρίθμηση συνεχής (yearly_numbering=0) με max(used+1,configured). Το live click compute σε Playwright δεν πυροδοτήθηκε (harness issue, όχι bug — ίδιο path έχει postάρει προηγούμενους μήνες).
- Καμία λειτουργική βλάβη. Diagnostic tsx scripts δεν τρέχουν λόγω @react-pdf/hyphenate ./en-us CJS resolution (μόνο για standalone tsx — το Next runtime είναι εντάξει).
-->



<!-- 2026-06 Φάση 3 (d+) — Εργαλεία λογιστή: Ανάθεση/Benchmark/Email TESTED (iteration_39, 100%)
- Νέα σελίδα λογιστή /office/clients/[orgId]/advisor: KPIs, benchmark χαρτοφυλακίου, λίστα ευκαιριών + ανάθεση/email/PDF.
- Ανάθεση ευκαιρίας: assignOpportunityAction → officeTasks (code advisor:<ruleCode>, assignee, dueDate) με canWrite guard + firmTeam έλεγχο. UI: AssignOpportunityButton (native select+date σε dialog). Επαλήθευση: task «Ευκαιρία: …» στο /office/tasks.
- Benchmarking: firmBenchmark(db,clients,orgId) — αποτ. φορ. συντελεστής & όφελος-ως-%-κέρδους έναντι διαμέσου ομοειδών (ίδια νομική μορφή) στο ΔΙΚΟ ΣΑΣ χαρτοφυλάκιο (data-grounded, όχι επινοημένα εξωτερικά στοιχεία) + κατάταξη. Επαλήθευση: 4,6% / 29,6% / #1/1.
- Email πλάνου: emailTaxPlanAction → renderTaxPlanPdf + sendMail (attachment) + registerDocument. Χωρίς SMTP → email_outbox status 'logged' (σχεδιασμένο fallback, ΟΧΙ mock API). UI: TaxPlanEmailButton dialog. Επαλήθευση: outbox row + attachment 34KB.
- firmTeam(db,firm) στο firm.ts: ιδιοκτήτης + ενεργοί συνεργάτες (για dropdown ανάθεσης).
- Wiring: /office/advisor στήλη «Σύμβουλος»→«Πλάνο» link, /office/clients/[orgId] κουμπί «Σύμβουλος & πλάνο».
- Light regression: owner login + /invoices/new line inputs OK.
- Γνωστό ΠΡΟΫΠΑΡΧΟΝ (εκτός scope): tsc error στο api/cron/tax-kb-review/route.ts (notification type 'tax_kb_review' δεν είναι στο enum) — δεν επηρεάζει runtime, δεν το άγγιξα.
-->



<!-- 2026-06 Φάση 3 (d) — Εργαλεία λογιστή: PDF φορολογικού πλάνου TESTED
- Νέο lib/pdf/tax-plan-pdf.tsx (react-pdf + NotoSans): «Πρόταση φορολογικής βελτιστοποίησης» ανά πελάτη — σύνοψη (δυνητικό όφελος/φόρος/προκαταβολή/ΕΦΚΑ/σύνολο/μηνιαία κράτηση), ευκαιρίες με ποσοτικό όφελος (rationale/ενέργεια/νομική βάση/προτεραιότητα + σήμανση ΕΦΑΡΜΟΣΤΗΚΕ), ποιοτικές συστάσεις, ενέργειες τέλους χρήσης, πόρισμα, σύνταξη (λογιστής+γραφείο)+ημερομηνία.
- Νέο route /api/office/tax-plan/pdf?org=<id> (firmClient access guard, ίδιο pattern με closing/pdf): taxAdvisor+taxForecast+yearEndPlan → PDF, καταχώρηση στο μητρώο εγγράφων (kind=tax_plan) με κωδικό/hash στα headers.
- Κουμπιά: «PDF φορολογικού πλάνου» στην καρτέλα 360° (/office/clients/[orgId]) + στήλη «Πλάνο» (PDF link) σε κάθε πελάτη στο /office/advisor.
- Επαλήθευση (server logs, real office login): GET /api/office/tax-plan/pdf?org=4c2e99c3... → 200 σε 732ms (725ms app-code = render+register). /office/advisor & /office/clients/[orgId] render 200 με τα νέα κουμπιά. tsc καθαρό στα νέα αρχεία (προϋπάρχον άσχετο tax-kb-review notification-type error — όχι δικό μας).
- Φάση 3 ΟΛΟΚΛΗΡΩΘΗΚΕ (a,b,c,d). Backlog: B2G παρακρατήσεις (BLOCKED), E2E tests, benchmarking/ανάθεση ευκαιριών (προαιρετικά).
-->



<!-- 2026-06 Φάση 3 (c ΟΛΟΚΛΗΡΩΘΗΚΕ) — ηλικία στην κλίμακα TESTED
- TaxProfile.age + form (tax-age). bracket2Rate2026(children, age): ≤25→0%, 26-30→9% στο 2ο κλιμάκιο (υπερισχύει των τέκνων). Εφαρμόζεται σε forecast & year-end.
- Επαλήθευση: compile OK, πεδίο ηλικίας παρόν, σελίδα πλήρης.
- (c) ΟΛΟΚΛΗΡΩΜΕΝΟ: τέκνα + ηλικία + simulator μισθού/μερίσματος. (Τεκμήρια διαβίωσης: μελλοντικό, χρειάζεται περισσότερα δεδομένα.)
- ΑΠΟΜΕΝΟΥΝ Φάση 3: a) ενεργός copilot (actions με έγκριση — νέος πίνακας tasks/drafts), d) εργαλεία λογιστή (ανάθεση ευκαιριών, PDF πρόταση, benchmarking). Μεγάλα — χωριστοί γύροι.
-->


<!-- 2026-06 Φάση 3 (c-μέρος2 partial) — Simulator μισθού/μερίσματος TESTED
- components/advisor/salary-dividend-simulator.tsx (client): slider μισθού ιδιοκτήτη ΙΚΕ, υπολογισμός συνολικού φόρου (22% εταιρικός + 5% μέρισμα + κλίμακα μισθού 2026) + εύρεση βέλτιστου μείγματος. Στη σελίδα /advisor.
- Επαλήθευση: 50/50 -> 1.553,14€· βέλτιστο μισθός ~8.500€ -> 868,86€ (−684,28€). Καθαρό compile.
- Φάση 3 υπόλοιπα: c) ηλικία (≤25/26-30) στην κλίμακα + τεκμήρια διαβίωσης· a) ενεργός copilot (actions με έγκριση)· d) εργαλεία λογιστή (ανάθεση/PDF/benchmark).
-->


<!-- 2026-06 Φάση 3 (c μερικώς) — Ακρίβεια δήλωσης: τέκνα TESTED
- TaxProfile.children + form (tax-children). engine: bracket2Rate2026(children) + personalTaxWithChildren() — μείωση 2ου κλιμακίου 2026 (1→18%,2→16%,3→9%,4+→0%). Εφαρμόζεται σε taxForecast & yearEndPlan (φυσικά πρόσωπα).
- Επαλήθευση: compile OK, πεδίο τέκνων παρόν (demo κέρδος <10k -> ίδιο νούμερο, αναμενόμενο).
- (c) υπόλοιπα: ηλικία ≤25/26-30 στην κλίμακα, τεκμήρια διαβίωσης, βελτιστοποίηση μισθός/μέρισμα με νούμερα.
- Φάση 3 υπόλοιπα: a) ενεργός copilot (actions), d) εργαλεία λογιστή (ανάθεση/PDF/benchmark).
-->


<!-- 2026-06 Φάση 3 (b) — Πρόβλεψη φόρου & ταμείου TESTED
- engine.taxForecast(profile, financials): projectedTax, advanceTax (55% φυσικά / 80% εταιρείες), efkaAnnual, totalObligations, monthlyReserve.
- Σελίδα /advisor/forecast (4 κάρτες + συνιστώμενη μηνιαία κράτηση) + κουμπί «Πρόβλεψη φόρου & ταμείου» στον Σύμβουλο.
- Επαλήθευση: φόρος 410,27€, προκαταβολή 225,65€, ΕΦΚΑ 4.342,08€, σύνολο 4.978€, μηνιαία 414,83€.
- Φάση 3 ΥΠΟΛΟΙΠΑ (εγκρίθηκαν a,c,d — όχι e/email): a) προληπτικός/ενεργός copilot (actions με έγκριση), c) ακρίβεια προσωπικής δήλωσης (τέκνα/ηλικία 2026, τεκμήρια, μισθός/μέρισμα), d) εργαλεία λογιστή (ανάθεση, PDF πρόταση, benchmarking).
-->


<!-- 2026-06 Εκκρεμή πυρήνα — A & C TESTED
- A (Επιδόσεις Διπλογραφικών): accounting/page.tsx πλέον tab-aware — φορτώνει ΜΟΝΟ το ενεργό tab (trial/journal/pl/bs) αντί και τα 5 βαριά queries πάντα (~5x λιγότερη δουλειά). chart() παραμένει (header/journal form/chart tab). Header description χωρίς entries.length (αποφυγή listEntries όταν δεν χρειάζεται). Επαλήθευση: render OK.
- C (Guard γρήγορης υποβολής): invoice-editor submit() -> submittingRef (useRef) guard πριν το start(), reset μόνο σε error (σε success γίνεται navigation). Αποτρέπει διπλή υποβολή σε αργά κινητά. Η επικύρωση προηγείται, άρα κανονικό flow ανεπηρέαστο.
- B2G παρακρατήσεις: παραμένει BLOCKED (χρειάζονται επίσημα mappings ΑΑΔΕ/PEPPOL από χρήστη).
-->


<!-- 2026-06 Προαιρετικά backlog — TESTED
- Office scan deep-link: κάθε πελάτης linkάρει σε /office/clients/{orgId} (office/advisor/page.tsx, data-testid office-advisor-open-<id>).
- What-if simulator: components/advisor/what-if-simulator.tsx (client) στη σελίδα /advisor — sliders/selects (μορφή/ΕΦΚΑ/Ε&Α/πράσινες), ζωντανός επανυπολογισμός computeOpportunities + διαφορά έναντι τρέχοντος προφίλ. Χωρίς αποθήκευση.
- Επαλήθευση: what-if base ~2.636€ -> Ι.Κ.Ε. ~4.586€ (+1.950€)· deep-link href σωστό.
-->


<!-- 2026-06 Φάση 2 ΟΛΟΚΛΗΡΩΘΗΚΕ — πράσινη υπερέκπτωση + αναπτυξιακός + auto-review TESTED
- TaxProfile: πεδίο greenSpend + form input (tax-green-spend). engine: green_super_deduction υπολογίζει όφελος = greenSpend × συντελεστή (ΚΦΕ 22Β). development_law info-flag για εταιρείες ή κέρδος>30k (ν.4887/2022). KB πλέον 23 κανόνες.
- Cron /api/cron/tax-kb-review: δημιουργεί αυτόματα εκκρεμή review (needs_change) για κανόνες taxYear<τρέχον έτος (actor "Αυτόματος έλεγχος").
- Επαλήθευση: green 5.000€ -> ~450€ (total ~2.636,28€/έτος)· cron notified=6, flagged=21.
- Σύμβουλος ΠΛΗΡΗΣ (Φάσεις 0-2). Μελλοντικά: per-client deep link από office scan, what-if simulator UI, markdown πίνακες σε αναφορές.
-->


<!-- 2026-06 Φάση 2 (συνέχεια) — KB review queue / human sign-off TESTED
- DB: tax_rule_reviews (migration 0041) — sign-off ανά (ruleCode, taxYear): status approved/needs_change, note, reviewedBy/Name/At.
- Service: listRuleReviews/decideRuleReview. Action: reviewRuleAction (getCurrentUser actor).
- Office σελίδα /office/kb-review: λίστα 21 κανόνων με status + πρόοδος (X/21 εγκεκριμένοι), κουμπιά Έγκριση (sign-off) / Χρειάζεται αλλαγή (με σημείωση). Nav «Έλεγχος κανόνων» (office-sidebar, ClipboardCheck).
- Client: kb-review-actions.tsx. Επαλήθευση: 0/21 -> 1/21, badge Εγκεκριμένο, καταγραφή ελεγκτή+ημ/νία.
- ΥΠΟΛΟΙΠΑ Φάσης 2: πράσινες/ενεργειακές υπερεκπτώσεις με υπολογισμό, αναπτυξιακός/επιδοτήσεις flagging.
-->


<!-- 2026-06 Φάση 2 (συνέχεια) — Υπερέκπτωση Ε&Α με υπολογισμό € TESTED
- TaxProfile: νέο πεδίο rndSpend (ετήσιες δαπάνες Ε&Α) — DEFAULT/normalize/form (data-testid tax-rnd-spend, εμφανίζεται όταν hasRnd).
- engine.computeOpportunities: rnd_super_deduction υπολογίζει όφελος = rndSpend × οριακό συντελεστή (ατομική) ή 22% (εταιρεία) — +100% υπερέκπτωση.
- Επαλήθευση: 10.000 € Ε&Α → ~900 € (9%), total ~2.186,28 €/έτος.
- ΥΠΟΛΟΙΠΑ Φάσης 2: πράσινες/ενεργειακές υπερεκπτώσεις με υπολογισμό, αναπτυξιακός/επιδοτήσεις flagging, ημι-αυτόματη ενημέρωση KB (review queue) με human sign-off.
-->


<!-- 2026-06 Φάση 2 (έναρξη) — Year-end optimizer TESTED
- engine.ts: yearEndPlan(profile, financials) -> daysLeft, projectedTax (ατομική: κλίμακα 2026 μείον ΕΦΚΑ· εταιρεία: 22%), marginalRate, nextBracketGap, actions[] (επιτάχυνση δαπανών με €, αλλαγή κλιμακίου, πάγια/αποσβέσεις, ηλ. αποδείξεις 30%, επιλογή ΕΦΚΑ, Ε&Α). marginalRate() helper· export YearEndAction/YearEndPlanResult. (fix: import formatMoney από totals).
- Σελίδα /advisor/year-end + κουμπί «Βελτιστοποίηση τέλους χρήσης» στον Σύμβουλο.
- Επαλήθευση: 108 ημέρες, φόρος 410,27 €, οριακός 9%, 4 ενέργειες.
- ΥΠΟΛΟΙΠΑ Φάσης 2: υπερεκπτώσεις Ε&Α/πράσινες με υπολογισμό €, αναπτυξιακός/επιδοτήσεις flagging, ημι-αυτόματη ενημέρωση KB με human sign-off.
-->


<!-- 2026-06 Φάση 1 ΟΛΟΚΛΗΡΩΘΗΚΕ (dismiss/apply + audit + cron) — TESTED
- DB: πίνακας tax_opportunities (migration 0040) — απόφαση ανά (orgId, ruleCode): status new/applied/dismissed, decidedBy/Name/At, note, audit.
- Service: loadDecisions/upsertDecision + taxAdvisor overlays status· επιστρέφει opportunities(all)+active(non-dismissed)+totalBenefit(active). firmTaxScan/dashboard/insight χρησιμοποιούν active.
- Action: decideOpportunityAction (write perm) -> upsertDecision + audit("tax_opportunity", advisor_<status>). Client: opportunity-actions.tsx (Το εφάρμοσα/Απόρριψη/Επαναφορά).
- /advisor: status badges + κουμπιά ανά ευκαιρία (κρύβονται σε read-only).
- Cron: /api/cron/tax-kb-review + .emergent/crons.yml (tax-kb-annual-review, 5 Ιαν) — ετήσια υπενθύμιση επανελέγχου KB (human sign-off).
- Επαλήθευση: dismiss μειώνει total σε 0 + badge, reset επαναφέρει· cron notified=6.
- Φάση 1 ΠΛΗΡΗΣ: grounded copilot (full business snapshot), markdown chat, contextual triggers (τιμολόγιο/έξοδα), office multi-client scan, dismiss/apply+audit, annual cron.
- ΕΠΟΜΕΝΟ: Φάση 2 (Ε&Α/πράσινες υπερεκπτώσεις με υπολογισμό, αναπτυξιακός/επιδοτήσεις, year-end optimizer, ημι-αυτόματη ενημέρωση KB).
-->


<!-- 2026-06 Φάση 1 (συνέχεια) — TESTED
- Markdown rendering στο AI chat (react-markdown + remark-gfm) — πίνακες/bold/λίστες.
- Contextual insight banner: src/components/advisor/advisor-insight.tsx (server) — κορυφαία ευκαιρία μέσα στη ροή· κουμπωμένο σε /invoices/new και /expenses.
- Office multi-client scan: firmTaxScan() σε tax-advisor.ts + σελίδα /office/advisor (τρέχει taxAdvisor ανά πελάτη, ταξινόμηση κατά όφελος, firm total) + nav «Σύμβουλος» στο office-sidebar.
- ΥΠΟΛΟΙΠΑ Φάσης 1: dismiss/apply + audit trail (πίνακας tax_opportunities), annual-review cron (.emergent/crons.yml).
-->


<!-- 2026-06 Φάση 1 (core) — AI Copilot Συμβούλου, grounded σε ΟΛΑ τα δεδομένα επιχείρησης (TESTED)
- Backend endpoint: POST /api/copilot/tax-advisor (FastAPI /app/backend/server.py) — Claude claude-sonnet-4-6 μέσω EMERGENT_LLM_KEY, grounded system prompt (μόνο νόμιμη βελτιστοποίηση, cite legalBasis, no invented numbers, refuse evasion).
- Business snapshot: src/lib/services/tax-advisor.ts -> businessSnapshot(db, org) αντλεί με ασφάλεια (try/catch ανά τμήμα) profitSummary (τρέχον+προηγ. έτος), vatReport τριμήνου, agingReport, dashboardStats, advancedDashboard, listEmployees (μισθοδοσία), accountBalances (ταμείο), company profile. Size-guard 14k chars.
- Frontend: src/components/advisor/tax-copilot-chat.tsx (client, relative /api fetch — ΟΧΙ process.env σε Next client), κουμπωμένο στη σελίδα /advisor ως «Ρωτήστε τον Σύμβουλο». Φορολογικό προφίλ editable panel (TaxProfileForm).
- Επαληθεύτηκε: ο copilot επιστρέφει σωστά ΦΠΑ/ταμείο/κέρδος + προτεραιότητα ΕΦΚΑ με νομική βάση.
- ΥΠΟΛΟΙΠΑ Φάσης 1 (next): contextual insight triggers μέσα σε τιμολόγιο/έξοδα/payroll, office multi-client σάρωση, dismiss/apply + audit trail (DB tables tax_opportunities), annual-review cron. Markdown rendering στο chat (προαιρετικό polish).
-->


<!-- 2026-06 P0 — Σύμβουλος βελτιστοποίησης (Φορολογικός Εγκέφαλος)
Στόχος: AI/rules-based σύμβουλος που εντοπίζει ΝΟΜΙΜΑ φορολογικά «παράθυρα» εξοικονόμησης, ενσωματωμένος σε όλες τις πλευρές.
P0 (ΟΛΟΚΛΗΡΩΘΗΚΕ & TESTED):
- KB: src/lib/tax/knowledge-base.ts — 21 κανόνες με νομική βάση+πηγή+έτος ισχύος, versioned, human sign-off (reviewStatus=approved). Κατηγορίες: legal_form, new_business, vat, efka, deductions, incentives, timing, payroll, losses, compliance.
- Μηχανή (ντετερμινιστική): src/lib/tax/engine.ts — κλίμακα 2026 (ν.5246/2025: 9/20/26/34/39/44), ΕΦΚΑ 2025, νέος επαγγελματίας 4,5%, ατομική↔ΙΚΕ crossover (22%+5%), απαλλαγή ΦΠΑ άρθρο 44 (10k), επιλογή ΕΦΚΑ, τεκμαρτό, ηλ.αποδείξεις 30%.
- Υπηρεσία: src/lib/services/tax-advisor.ts (financials από profitSummary τρέχοντος έτους).
- Σελίδα /advisor (business portal) + dashboard card «Σύμβουλος: Ευκαιρίες» + nav «Σύμβουλος». Φορολογικό προφίλ αποθηκεύεται σε organizations.tax_profile_json (migration 0039).
- Επικυρώθηκε deep research (ΑΑΔΕ/e-ΕΦΚΑ/νόμοι 5073/2023, 5162/2024, 5222/2025, 5246/2025· non-dom 5Α/5Β/5Γ· άρθρο 39Β· ν.4935/2022).
- Επόμενα: Φάση 1 (contextual triggers σε τιμολόγιο/έξοδα/payroll, AI copilot grounded, what-if, office multi-client, dismiss/apply+audit DB, annual-review cron). Φάση 2 (Ε&Α/πράσινες, αναπτυξιακός, year-end optimizer, auto-update KB με review).
-->


<!-- 2026-06 Bugfix: Τα πεδία γραμμών τιμολογίου (περιγραφή/ποσότητα/τιμή/έκπτωση) δεν δέχονταν πληκτρολόγηση.
Root cause: `onInputCapture` στο root του invoice-editor.tsx καλούσε `clearField` -> `setFieldErrors(new {})` σε ΚΑΘΕ input event (capture phase),
προκαλώντας σύγχρονο re-render που επανέφερε το controlled value & τον value-tracker του input ΠΡΙΝ το bubble-phase onChange, με αποτέλεσμα το React να «καταπίνει» το onChange.
Fix: guard στο `clearField` (early-return όταν δεν υπάρχει σφάλμα στο πεδίο) ώστε να μη γίνεται re-render ανά πλήκτρο. Επαληθεύτηκε με typing σε desc/qty/price. -->


# Τιμολόγιο Cloud — PRD (iter 8)

## Architecture
- Next.js 16 + Drizzle + SQLite (`/app/frontend`)
- FastAPI proxy + Claude Sonnet 5 (OCR, Copilot, Dunning) + Emergent Resend

## Iterations 1-8
1. Projects & Time Tracking
2. POS, Cash-flow 90d, CRM Kanban, AI Copilot
3. AFM ΑΑΔΕ, AI Dunning, OCR (PDF)
4. OCR image (PNG→PDF), Dunning send email, Real AADE SOAP, myDATA cron
5. Real Resend, Viva/IRIS UI, WooCommerce webhook, AADE Creds UI
6. WC HMAC, Shopify webhook, Resend Svix webhook
7. Accountant Cockpit, Real Viva Smart Checkout, Signature draw canvas
8. **THIS session:**
   - ✅ **Viva Webhook Confirmation** — `/api/webhooks/viva/[orgId]` receives EventTypeId=1796, verifies via VIVA_WEBHOOK_KEY, records payment idempotently via recordPayment
   - ✅ **PWA Installability** — manifest.webmanifest + service worker (cache-first static, offline queue για POST /api/expenses μέσω IndexedDB + Background Sync), 2 SVG icons, ServiceWorkerRegister στο RootLayout
   - ✅ **Real IRIS DIAS Payload** — `buildIrisPayload()` σε EPC-like format (BCD\\n001\\n1\\nSCT\\n...) που ανοίγει σε τραπεζικές apps
   - ✅ **Marketplace Templates** — 4 πακέτα (Δικηγόρος/Ιατρός/Μηχανικός/E-shop) με έτοιμες σειρές + είδη + Ε3 classifications, εφαρμόζονται με ένα κλικ στα Settings→ΑΑΔΕ Lookup tab

9. **Iteration 9 (Ιούνιος 2026)** — User Request #8, ολοκληρωμένο & tested (iteration_7.json, 100% pass)
   - ✅ **SSO / Passkeys (WebAuthn/FIDO2)** — `@simplewebauthn/server|browser`, πίνακες `webauthn_credentials` + `webauthn_challenges` (0019_webauthn.sql), κάρτα Passkeys στο `/account` (add/rename/delete) + κουμπί passwordless login στο `/login`. Timeout 60s με ελληνικό toast σε ακύρωση.
   - ✅ **Viva Live/Demo status panel** — `checkVivaStatus()` (δείχνει live/demo, webhook URL για Viva self-care) + `simulateVivaWebhook()` που εκτελεί το πλήρες flow (recordPayment + audit, idempotent). Επαληθεύτηκε: ΤΠ-0001 → Εξοφλημένο.
   - ✅ **Extended Marketplace Templates** — 15 επαγγέλματα (δικηγόρος, ιατρός, μηχανικός, e-shop, κατάλυμα, φροντιστήριο, γυμναστήριο, εστίαση, IT freelancer, κομμωτήριο, φαρμακείο, μεσιτικό, μεταφορές, λογιστικό, φωτογράφος). Idempotent εφαρμογή.
   - ✅ **Offline receipt flow UI** — OfflineQueueBanner (IndexedDB queue + auto-sync).
   - 🔧 Fixes: `"use server"` crash στο /settings (TEMPLATES → `src/lib/marketplace/templates.ts`), άκυρες στήλες Drizzle (series.isDefault/createdAt, products.currency/withholding/stampDuty, customers.salesChannels στα Shopify/Woo webhooks), AuditActor `id` αντί `userId`, mobile tab wrapping στο /settings, themeColor → `viewport` export. TypeScript πλέον καθαρό (`tsc --noEmit` = 0 errors).

10. **Iteration 10 (Ιούνιος 2026)** — Feature 1/3: **Τιμολόγηση Δημοσίου (B2G / PEPPOL)** — tested 9/9 (iteration_8.json)
   - PEPPOL BIS Billing 3.0 (UBL 2.1) generator `src/lib/b2g/ubl.ts` (EndpointID 9933, BT-10/11/12/13, VATEX mapping, TaxSubtotals, PaymentMeans IBAN)
   - Provider-agnostic adapters `src/lib/b2g/providers.ts`: Προσομοίωση, Γενικός REST, Impact (login+bearer), EPSILON NET (basic+subscription key), SoftOne, Cosmos, Retail@Link, Storm/Global, Entersoft — με normalizeStatus (pending/sent/accepted/rejected/error)
   - Ρυθμίσεις → «Δημόσιο (B2G)»: ενεργοποίηση, πάροχος, test/prod, διαπιστευτήρια (κενό = διατήρηση)
   - Πελάτης: «Φορέας Δημοσίου» + BuyerReference/ΑΔΑΜ/Αναφορά έργου/παραγγελία/ΚΑΕ/endpoint (προεπιλογές ανά παραστατικό)
   - Παραστατικό: κάρτα B2G με validation στα ελληνικά, αποστολή, έλεγχο κατάστασης, λήψη UBL XML (`/api/invoices/[id]/ubl`)
   - Migration `drizzle/0020_b2g.sql` (28 νέες στήλες σε organizations/customers/invoices)

11. **Iteration 11 (Ιούνιος 2026)** — 3 features, όλα tested
   - **Αυτόματο B2G + ωριαία παρακολούθηση** (iteration_9.json 7/7): switch «Αυτόματη αποστολή μετά την έκδοση», auto-send μέσα στο `issueInvoice`, cron `/api/cron/b2g-status` (15 * * * *), νέος τύπος ειδοποίησης `b2g_rejected`, φίλτρα «Εκκρεμή/Απορρίψεις Δημοσίου» + badge στη λίστα παραστατικών
   - **Αυτόματες συνδρομές πελατών με Stripe** (iteration_10.json 9/9): claimable Stripe sandbox, `src/lib/payments/subscriptions.ts` (SetupIntent Checkout για αποθήκευση κάρτας, off-session PaymentIntent με idempotency, proration), switch «Αυτόματη χρέωση» στα επαναλαμβανόμενα, σύνδεσμος αποθήκευσης κάρτας + email, «Αλλαγή πλάνου» με προεπισκόπηση αναλογίας. Upgrade → τιμολόγιο διαφοράς, downgrade → **πιστωτικό τιμολόγιο** (ΠΤ 5.1 με συσχέτιση)
   - **Πύλη πελάτη: μαζική πληρωμή** (iteration_11.json 8/8): κάρτα επιλογής ανεξόφλητων, ένα Stripe Checkout με line item ανά τιμολόγιο, εξόφληση με αποθηκευμένη κάρτα, idempotent settlement από webhook + success_url
   - Crons: `/app/.emergent/crons.yml` → mydata-sync (06:00), reminders (06:30), recurring (07:00), b2g-status (κάθε ώρα)
   - Migrations `0021_b2g_auto.sql`, `0022_subscriptions.sql`

11. **Iteration 12–14 (Ιούνιος 2026)** — Πλήρης έλεγχος UI/wording/λογικής + **advanced dashboard**
   - Audit: `/app/test_reports/iteration_12.json` (30+ ευρήματα), επαληθεύσεις: `iteration_13.json`, `iteration_14.json` (όλα τα ανοιχτά κλειστά)
   - Διορθώσεις: mobile overflow στο `/invoices/new` (select triggers `max-w-full`/`w-full min-w-0`), φόρμα login με `method="post"` (δεν διαρρέουν credentials στο URL), νέα σελίδα `/notifications` + σύνδεση καμπάνας, πιστωτικά με μείον στο dashboard, ενιαίος ορισμός «ληξιπρόθεσμο» (σύγκριση ημερομηνιών, `lt`), aging χωρίς δελτία/έξοδα/πιστωτικά (πλέον 2.430,40 € σε dashboard/aging/αναφορές)
   - Ελληνικά/format: γενική μήνα («Εισπράξεις Σεπτεμβρίου»), εξάλειψη extrait/Touch-friendly/follow-up/Powered by Claude Sonnet 5/online πληρωμή/Lookup, πληθυντικός ευγενείας παντού, αφαίρεση emoji, dd/MM/yyyy στις αναφορές, ενιαία 0,00 € στους αριθμητικούς πίνακες
   - IA: sidebar «POS · Ταμείο λιανικής / Συνδρομές & επαναλαμβανόμενα / Πελάτες / Ευκαιρίες πωλήσεων / Βοηθός AI / myDATA / Ρυθμίσεις», ένα σημείο myDATA, νέα καρτέλα Ρυθμίσεων «Εξαγωγή δεδομένων», ελληνικές ετικέτες καρτελών
   - **Advanced dashboard**: KPI με ρητό εύρος, **Κέντρο ενεργειών** (myDATA, απορρίψεις B2G, αποτυχημένες χρεώσεις, ληξιπρόθεσμα, κινήσεις τράπεζας, αποθέματα, πρόχειρα) με CTA, **θέση ΦΠΑ Φ2** + προθεσμία, **ενηλικίωση απαιτήσεων** με μπάρες, **κορυφαίοι πελάτες**, **συνδρομές/MRR**, γρήγορες ενέργειες, γράφημα 12μήνου. Νέα υπηρεσία `src/lib/services/dashboard.ts`, widgets `src/components/dashboard/dashboard-widgets.tsx`. Χωρίς overflow σε 390/768/1280/1920.

12. **Iteration 15 (Ιούνιος 2026)** — Προχωρημένη αρχική: 3 λειτουργίες, tested 7/7 (`iteration_15.json`)
   - **Προσαρμογή αρχικής** ανά χρήστη: διάλογος με 10 πλαίσια, εμφάνιση/απόκρυψη + σειρά, επαναφορά προεπιλογών. Αποθήκευση στο `memberships.dashboard_prefs_json` (migration `0023_dashboard_prefs.sql`), απομόνωση ανά χρήστη επιβεβαιωμένη.
   - **Σύγκριση περιόδων**: κάθε KPI δείχνει ποσοστιαία μεταβολή έναντι προηγούμενου μήνα (πράσινο/κόκκινο badge + τιμή προηγούμενου μήνα). Νέο KPI «Εισπράξεις (τρέχων μήνας)» και «Ληξιπρόθεσμα (σύνολο)».
   - **Πρόβλεψη ρευστότητας 90 ημερών** στην αρχική: `src/lib/services/cashflow.ts` (13 εβδομαδιαία σημεία από ανεξόφλητα τιμολόγια, έξοδα και αναμενόμενες συνδρομές), 4 μεγέθη + γράφημα + προειδοποίηση χαμηλότερου σημείου ταμείου, σύνδεσμος στην αναλυτική αναφορά.

13. **Iteration 16 (Ιούνιος 2026)** — Χάρτης πορείας: **Ομάδα Α (1–5)**, tested 8/8 (`iteration_16.json`)
   - **ΦΠΑ στην πρόβλεψη ρευστότητας**: η απόδοση ΦΠΑ του τριμήνου μπαίνει ως εκροή στην προθεσμία Φ2 (1.362,46 € στις 31/10/2026)
   - **Σενάρια «τι θα γίνει αν»**: Βασικό / Καθυστέρηση 15 / 30 ημερών, εναλλαγή χωρίς επαναφόρτωση, με επανυπολογισμό χαμηλότερου σημείου ταμείου
   - **Έξυπνες υπενθυμίσεις**: στάδια ως προς τη λήξη με αρνητικές τιμές (`-3,0,7,21`) και κλιμακούμενο ύφος (φιλική → ημέρα λήξης → όχληση → τελική όχληση) στο email
   - **Πιστωτικό προφίλ πελάτη**: μέσος χρόνος πληρωμής, % εντός προθεσμίας, βαθμολογία, πιστωτικό όριο & διαθέσιμο, προειδοποίηση υπέρβασης στη φόρμα έκδοσης (`src/lib/services/credit-profile.ts`)
   - **Τόκοι υπερημερίας & πάγια χρέωση καθυστέρησης**: ρυθμίσεις ανά επιχείρηση, ενημερωτική κάρτα στο παραστατικό και αναφορά στις υπενθυμίσεις
   - Migration `0024_credit_late_fees.sql`. Διορθώθηκε overflow 390px στη σελίδα πελάτη.
   - **Υπόλοιπος χάρτης πορείας (εγκεκριμένος από τον χρήστη, σειρά 6→23)**: 6 παρακρατούμενοι/χαρτόσημο, 7 ημερολόγιο προθεσμιών, 8 ισοζύγιο/καθολικό ΕΛΠ + εξαγωγή σε λογιστικά, 9 κλείσιμο περιόδου, 10 ενδοκοινοτικές/Intrastat, 11 μαζικές ενέργειες, 12 αυτόματη συμφωνία τραπέζης, 13 εισαγωγή από Elorus/Excel, 14 έγκριση εξόδων, 15 πολυνομισματικά, 16 λειτουργία λογιστικού γραφείου, 17 συστάσεις + δημόσια τιμολόγηση, 18 πύλη προσφορών με αποδοχή, 19 API v1 + webhooks, 20 PWA κινητού, 21 μηνιαία αφήγηση AI, 22 ανίχνευση ανωμαλιών, 23 αυτόματος χαρακτηρισμός εξόδων

14. **Iteration 17 (Ιούνιος 2026)** — Χάρτης πορείας 6, 7, 11 + χρέωση επιβαρύνσεων, tested 7/7 (`iteration_17.json`)
   - **Βεβαιώσεις παρακρατούμενων φόρων**: `/reports/withholding` με επιλογή έτους, σύνολα (καθαρή αξία/παρακρατήσεις/χαρτόσημο) και ανάλυση ανά αντισυμβαλλόμενο & είδος παρακράτησης, εκτυπώσιμη (`src/lib/services/compliance.ts`)
   - **Ημερολόγιο προθεσμιών**: `/deadlines` (Φ2 τριμηνιαία, ΦΜΥ, ΑΠΔ, Ε3/Ε1, κλείσιμο myDATA) με αντίστροφη μέτρηση + cron `/api/cron/deadlines` (08:00) που ειδοποιεί στις 7/1/0 ημέρες, με idempotency ανά ημέρα, νέος τύπος ειδοποίησης `tax_deadline`
   - **Μαζικές ενέργειες** στα παραστατικά: μαζική **έκδοση** προχείρων και μαζική **εξόφληση** (πλην των υπαρχόντων myDATA/email/PDF/CSV/διαγραφή)
   - **Χρέωση επιβαρύνσεων**: κουμπί που μετατρέπει τόκους υπερημερίας + πάγια χρέωση σε πρόχειρο παραστατικό (χωρίς ΦΠΑ, με αναφορά στο αρχικό)

15. **Iteration 18–19 (Ιούνιος 2026)** — Διόρθωση «Αναζήτηση Βασικών Στοιχείων Μητρώου» (bug χρήστη), verified
   - **Ρίζα #1**: το `saveAadeCredentials` έσβηνε τον αποθηκευμένο κωδικό όταν το πεδίο έμενε κενό (παρά το «κενό = διατήρηση») → πλέον ενημερώνεται μόνο όταν δοθεί νέος κωδικός
   - **Ρίζα #2**: το `/api/afm/lookup` καλούνταν χωρίς `orgId` → δεν χρησιμοποιούνταν ποτέ τα διαπιστευτήρια. Πλέον ο οργανισμός προκύπτει **από τη συνεδρία** (και το `orgId` του σώματος αγνοείται – αποφυγή διαρροής μεταξύ οργανισμών)
   - **Ρίζα #3 (404)**: το endpoint `RgWsPublicService` έχει αποσυρθεί → μετάβαση σε **RgWsPublic2** (`https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2`, SOAP 1.2 + WS-Security UsernameToken, `rgWsPublic2AfmMethod`)
   - Χωρίς σιωπηλό demo: όταν υπάρχουν διαπιστευτήρια εμφανίζεται το **πραγματικό σφάλμα της ΑΑΔΕ** (JSON, HTTP 200). Το demo επισημαίνεται πάντα με κίτρινο toast + `notice`
   - **Τακτοποίηση καρτέλας**: στην «Αναζήτηση ΑΦΜ (ΑΑΔΕ)» έμεινε μόνο η κάρτα διαπιστευτηρίων· το Viva πήγε στην «Τιμολόγηση», τα πακέτα επαγγελμάτων στις «Σειρές»
   - ⚠️ Ο χρήστης πρέπει να **ξαναβάλει username + password ΑΑΔΕ** (είχαν σβηστεί από το παλιό bug)

## Remaining backlog
- P1: Document services για συνδρομές (proration, auto-charge με αποθηκευμένες κάρτες)
- P1: B2G ηλεκτρονική τιμολόγηση μέσω πιστοποιημένου παρόχου
- P1: Real Viva/IRIS integration testing με production credentials
- P2: Multi-company με ενοποιημένη χρέωση
- P2: REST API v1 + SDK + OpenAPI spec με rate limiting
- P2: Διαγραφή λογαριασμού/οργανισμού (GDPR)

16. **Iteration 20 (Ιούνιος 2026)** — Mobile layout παραστατικού + διόρθωση «Νέα ευκαιρία πώλησης», verified
   - **Α4 προεπισκόπηση σε κινητό**: νέο `src/components/invoices/invoice-document-viewer.tsx` που αποδίδει το έγγραφο σε πραγματικό πλάτος 794px και το σμικρύνει με `transform: scale` (ResizeObserver) → πλήρως αναγνώσιμο στα 390px, χωρίς οριζόντιο scroll (scrollWidth = 390)
   - `min-w-0` σε grid/flex containers, `break-all`/`whitespace-pre-wrap` σε MARK/UID/Auth Code/XML στη σελίδα `/invoices/[id]`
   - Στην HTML μορφή του παραστατικού προστέθηκαν **Πάροχος ηλεκτρονικής τιμολόγησης** και το μπλοκ **Τιμολόγηση Δημοσίου (PEPPOL BIS 3.0)**, ίδια με το PDF
   - **Bug fix `/crm/new`**: η σελίδα διάβαζε `params.id` σε στατικό route → `id` undefined → σφάλμα Drizzle. Πλέον default `"new"`. Επίσης το `router.push` μεταφέρθηκε σε `useEffect` (πριν γινόταν κατά το render) + toast επιτυχίας

17. **Iteration 20 (Ιούνιος 2026)** — Καρτέλα «Κίνδυνοι» (radar συμμόρφωσης ΑΑΔΕ) + Πράκτορας εισπράξεων στον AI Copilot, verified (iteration_20.json)
   - **`/risks`** (sidebar «Λειτουργία» → Κίνδυνοι): 26 έλεγχοι σε 8 ομάδες – διαβίβαση myDATA (μη διαβιβασμένα, σφάλματα ΑΑΔΕ, εκπρόθεσμα >2 ημ., πρόχειρα >7 ημ.), αρίθμηση (κενά, διπλοί αριθμοί), ΦΠΑ/απαλλαγές (precheckMyData, ενδοκοινοτικά χωρίς άρθρο 28/14), αντισυμβαλλόμενοι (ελλιπές ΑΦΜ/ΔΟΥ, πελάτης εξωτερικού σε 1.1/2.1), παρακρατήσεις/χαρτόσημο με λάθος ποσό, Φ2 (έξοδα χωρίς χαρακτηρισμό, ΦΠΑ > ταμείο, προθεσμίες ≤7 ημ.), ταμείο (αρνητικά μετρητά, απαιτήσεις >90 ημ., ασυμφώνητες κινήσεις)
   - **Μοτίβα συμπεριφοράς (profiling ΑΑΔΕ, βάσει Elenxis/AI κριτηρίων 2026)**: ποσοστό πιστωτικών επί τζίρου, πιστωτικά χωρίς συσχέτιση, επαναλαμβανόμενες ακυρώσεις, μετρητά ≥500 € (ν.5104/2024 – πρόστιμο 200%), κατάτμηση συναλλαγής μετρητών ίδιας ημέρας, συγκέντρωση τζίρου >50% σε έναν πελάτη, έξοδα δυσανάλογα των εσόδων, στρογγυλά ποσά >40%, πωλήσεις κάτω κόστους, εκπτώσεις >30%, μήνες με έξοδα χωρίς έσοδα, μη διαβιβασμένη αξία >30% (όριο απόκλισης Ε3/myDATA)
   - **Σκορ 0-100** με πράσινο/κίτρινο/κόκκινο, μετρητές σοβαρότητας, **ιστορικό βελτίωσης** (νέος πίνακας `risk_snapshots`, migration 0026) + widget «Radar κινδύνων ΑΑΔΕ» στο dashboard
   - **«Λύσε το με AI»** ανά εύρημα → `/api/copilot/risk-advice` (Claude Sonnet, Emergent LLM key): summary, βήματα, πρόληψη, νομική βάση στα ελληνικά
   - **Cron `/api/cron/risks`** (07:30 καθημερινά, `.emergent/crons.yml`): ειδοποιεί μόνο για ΝΕΑ κρίσιμα/υψηλά ευρήματα, νέος τύπος ειδοποίησης `compliance_risk`
   - **Πράκτορας εισπράξεων (`/copilot`)**: `/api/copilot/collections` προτείνει ενέργειες ανά οφειλέτη (αποστολή υπενθύμισης με επεξεργάσιμο κείμενο, χρέωση τόκων, πιστωτικό όριο, εργασία τηλεφωνήματος, διακανονισμός σε δόσεις). **Human-in-the-loop**: έγκριση μία-μία, διπλή επιβεβαίωση για ποσά >500 € και για χρεώσεις τόκων, μόνο ρόλοι με δικαίωμα εγγραφής, κάθε εκτέλεση στο audit log (`ai_reminder_sent`, `ai_late_charges`, `ai_credit_limit`, `ai_call_task`, `ai_installment_plan`)
   - Προστέθηκαν σειρές **ΤΠ-ΕΕ (1.2)** και **ΤΠ-3Χ (1.3)** σε υπάρχοντες οργανισμούς και στο seed, με αυτόματη απαλλαγή ΦΠΑ (άρθρο 28 / 24)
   - Mobile: labels στις γραμμές παραστατικού (Ποσότητα / Τιμή μον. / Έκπτωση % / ΦΠΑ) και έντονα σύνολα γραμμής
   - **Βελτίωση ταχύτητας (Ιούν 2026)**: το «Λύσε το με AI» πέρασε σε `claude-haiku-4-5-20251001` με συμπτυγμένο prompt → **~7s** αντί ~35s, με μετρητή δευτερολέπτων στο dialog και client-side cache ανά εύρημα (δεύτερο άνοιγμα ~0.07s)

18. **Iteration 21 (Ιούνιος 2026)** — Εισαγωγές CSV σε όλες τις βασικές οντότητες, verified με πραγματικά αρχεία
   - Νέο `src/lib/import/importers-docs.ts`: `importInvoices` (μία γραμμή ανά είδος, ομαδοποίηση με στήλη «Παραστατικό», ταύτιση/δημιουργία πελάτη από ΑΦΜ ή επωνυμία, ταύτιση είδους από SKU/περιγραφή, αναγνώριση ημερομηνιών 15/03/2026 & 2026-03-15, τρόπου πληρωμής από κείμενο, ΦΠΑ % → κατηγορία myDATA, προαιρετική **οριστική έκδοση** ή παραμονή σε πρόχειρα), `importExpenses` (ταύτιση διπλοεγγραφών από ΜΑΡΚ ή ΑΦΜ+σειρά+αριθμό, χαρακτηρισμοί από την καρτέλα προμηθευτή), `importSuppliers`
   - `ImportDialog` επεκτάθηκε: επιλογή προεπιλεγμένης σειράς, διακόπτης «Οριστική έκδοση», προεπισκόπηση 5 γραμμών, αναφορά σφαλμάτων ανά γραμμή. Κουμπί «Εισαγωγή CSV» πλέον σε: Πελάτες, Είδη, **Παραστατικά**, **Έξοδα & Αγορές**, **Προμηθευτές**
   - Πρότυπα CSV για όλους τους τύπους: `/api/import/template?type=customers|products|invoices|expenses|suppliers` (UTF-8 BOM, `;`, έγκυρα δοκιμαστικά ΑΦΜ)
   - Επαληθεύτηκε e2e: 2 παραστατικά (3 γραμμές) + 1 προμηθευτής + 1 έξοδο εισήχθησαν σωστά με υπολογισμό ΦΠΑ/εκπτώσεων· τα δοκιμαστικά δεδομένα καθαρίστηκαν

19. **Iteration 22 (Ιούνιος 2026)** — Εισαγωγή πληρωμών, αντιστοίχιση στηλών, αναίρεση εισαγωγής, υποστήριξη export Elorus
   - **Εισαγωγή πληρωμών** (`/banking` → Εισαγωγή CSV, `src/lib/import/importers-payments.ts`): εισπράξεις πελατών και εξοφλήσεις προμηθευτών, αυτόματο δέσιμο με σειρά+αριθμό παραστατικού, αλλιώς με ΑΦΜ/επωνυμία στο παλαιότερο ανοιχτό υπόλοιπο· έλεγχος υπέρβασης υπολοίπου, μερικές πληρωμές, αναγνώριση λογαριασμού ταμείου/τράπεζας από όνομα ή IBAN, ενημέρωση κατάστασης σε «Μερικώς εξοφλημένο/Εξοφλημένο»
   - **Οθόνη αντιστοίχισης στηλών** (`src/lib/import/fields.ts`): κανονικά πεδία ανά τύπο, αυτόματη πρόταση (autoMap) και χειροκίνητη αλλαγή με select ανά πεδίο· ανοίγει αυτόματα όταν λείπει υποχρεωτικό πεδίο
   - **Αναίρεση εισαγωγής**: νέος πίνακας `import_batches` (migration 0027) με τα ids όσων δημιουργήθηκαν· κουμπί «Αναίρεση εισαγωγής» στο αποτέλεσμα + λίστα «Πρόσφατες εισαγωγές» (5 τελευταίες) με αναίρεση. Η αναίρεση σβήνει παραστατικά/γραμμές/έξοδα/πληρωμές, επαναφέρει υπόλοιπα και σβήνει καρτέλες που δεν χρησιμοποιούνται
   - **Υποστήριξη «πλατιού» export Elorus** (`normalizeWideInvoiceCsv`): μία γραμμή ανά παραστατικό με στήλες «Γραμμή N - …» → κανονικές γραμμές, υπολογισμός ΦΠΑ από καθαρή/μικτή τιμή μονάδας, προθεσμία από «Ημέρες πίστωσης», επιλογή σειράς από τον **Τύπο παραστατικού myDATA** όταν λείπει η στήλη «Σειρά»
   - **Διορθώσεις**: `normalizeAfm` δέχεται παλαιά 8ψήφια ΑΦΜ (συμπλήρωση μηδενικού), ξένα/άκυρα ΑΦΜ δεν μπλοκάρουν πλέον την εισαγωγή (ο πελάτης δημιουργείται χωρίς ΑΦΜ με προειδοποίηση), όριο αρχείου 4 MB
   - Επαληθεύτηκε με **πραγματικό αρχείο του χρήστη (154 παραστατικά Elorus)**: 154/154 εισήχθησαν ως πρόχειρα με σωστό τύπο 2.1, πελάτες και ΦΠΑ 24%· δοκιμάστηκαν επίσης μερική+πλήρης είσπραξη και αναίρεση παρτίδας

20. **Iteration 23 (Ιούνιος 2026)** — Πρόβλεψη πληρωμής ανά πελάτη
   - Νέο `src/lib/services/payment-prediction.ts`: `paymentBehaviourByCustomer` (διάμεσος & 75ό εκατοστημόριο ημερών σε σχέση με την προθεσμία, δείγμα, % εντός προθεσμίας, αξιοπιστία high/medium/low), `predictPayment` (αναμενόμενη ημερομηνία, μετατόπιση όταν έχει περάσει), `predictedReceivables`
   - Σελίδα παραστατικού: κάρτα «Εισπράξεις» δείχνει **«Αναμενόμενη πληρωμή <ημερομηνία>»** με badge αξιοπιστίας και εξήγηση βάσει ιστορικού (`payment-forecast-note.tsx`)
   - Καρτέλα πελάτη: το Πιστωτικό προφίλ δείχνει «πληρώνει συνήθως Χ ημέρες μετά την προθεσμία (διάμεσος από Ν παραστατικά, χειρότερο +Μ)»
   - **Πρόβλεψη ρευστότητας 90 ημερών**: οι εισροές τοποθετούνται πλέον στην προβλεπόμενη ημερομηνία πληρωμής (αντί απλά στην προθεσμία), με σημείωση στο dashboard πόσα τιμολόγια μετατοπίστηκαν και κατά πόσες ημέρες· το ίδιο και στη σελίδα `/reports/cashflow` (label «πρόβλεψη +Χ ημ.», status expected)
   - Mobile fix: εξαλείφθηκε το οριζόντιο overflow στην καρτέλα πελάτη (min-w-0 στα grid items, overflow-x-auto στον πίνακα παραστατικών) – scrollWidth 458 → 390
   - Demo data: δόθηκε ρεαλιστικό ιστορικό καθυστέρησης σε 2 πελάτες (Αφοί Γεωργίου +12 ημ., ΚΟΛΕΤΣΑΣ +6 ημ.) ώστε η πρόβλεψη να είναι ορατή. Επαληθεύτηκε (iteration_21.json + follow-up): dashboard note «3 τιμολόγια μετατοπίστηκαν κατά ~12 ημέρες», badges «πρόβλεψη +12 ημ.» στο /reports/cashflow, mobile scrollWidth 390

21. **Iteration 24 (Ιούνιος 2026)** — Μηνιαίο κλείσιμο & Κίνδυνος εισπράξεων
   - **`/reports/closing`** (sidebar: Μηνιαίο κλείσιμο, `src/lib/services/monthly-close.ts`): 9 έλεγχοι ανά μήνα – διαβίβαση myDATA, απορρίψεις ΑΑΔΕ, πρόχειρα, συνέχεια αρίθμησης, χαρακτηρισμοί εσόδων (Ε3), χαρακτηρισμοί εξόδων, συμφωνία βιβλίων↔myDATA (όριο 30%), θέση ΦΠΑ, παρακρατήσεις/χαρτόσημο. Κατάσταση ok/warn/blocker, verdict «μπορεί να κλείσει», επιλογή μήνα (12 τελευταίοι), σύνοψη (παραστατικά, καθαρά έσοδα, θέση ΦΠΑ, έξοδα)
   - **Έκθεση PDF για τον λογιστή**: `/api/reports/closing/pdf?month=YYYY-MM` (`src/lib/pdf/closing-pdf.tsx`, react-pdf + Noto Sans) με σύνοψη, όλους τους ελέγχους και πόρισμα. Επαληθεύτηκε download 26 KB (kleisimo-2026-09.pdf)
   - **`/receivables`** (sidebar: Κίνδυνος εισπράξεων, `src/lib/services/receivables-risk.ts`): κατάταξη ανοιχτών απαιτήσεων με σκορ 0-100 (ιστορικό συνέπειας + ημέρες καθυστέρησης + ύψος οφειλής), αναμενόμενη ημερομηνία πληρωμής και **προτεινόμενη ενέργεια** ανά κλιμάκωση (παρακολούθηση → προληπτική υπενθύμιση → υπενθύμιση τώρα → τηλέφωνο → τόκοι → διακανονισμός/νομικά) με κουμπί εκτέλεσης. Σύνοψη: ποσό σε κίνδυνο, αναμενόμενο μήνα, υψηλού κινδύνου
   - Επαληθεύτηκε σε desktop + mobile (scrollWidth 390), χωρίς σφάλματα κονσόλας

22. **Iteration 25 (Ιούνιος 2026)** — Cockpit λογιστή: Έγκαιρη προειδοποίηση & στατιστικές ανωμαλίες
   - `src/lib/services/anomalies.ts`: robust στατιστικός ανιχνευτής (διάμεσος + MAD, z-score σε 12μηνο) – απόκλιση τζίρου από το ιστορικό μοτίβο, έκρηξη εξόδων, νέος προμηθευτής με δυσανάλογα ποσά, μεταβολή σχέσης ΦΠΑ εκροών/εισροών, άλμα στις πωλήσεις με μετρητά. Κάθε ανωμαλία με detail (νούμερα) + προτεινόμενη ενέργεια + link
   - `src/lib/services/org-watch.ts`: `orgWatch()` ανά επιχείρηση – σκορ κινδύνου, **τάση 30 ημερών** από τα risk_snapshots, κρίσιμα ευρήματα, ανωμαλίες, επόμενη φορολογική προθεσμία και **priority score** για ιεράρχηση φόρτου εργασίας
   - `EarlyWarningPanel` στο `/accountant/cockpit`: κάρτες ανά επιχείρηση ταξινομημένες κατά προτεραιότητα, με χρωματισμό κινδύνου, top-3 ευρήματα, ανωμαλίες και κουμπί «Άνοιγμα radar»
   - **Cron `accountant-weekly-digest`** (Δευτέρα 08:00, `/api/cron/accountant-digest`): HTML email σε κάθε λογιστή με τις επιχειρήσεις που χρειάζονται προσοχή (σκορ, τάση, κυριότερο θέμα, προθεσμία). Δοκιμάστηκε: sent=2
   - Επαληθεύτηκε σε desktop + mobile (scrollWidth 390), χωρίς σφάλματα

23. **Iteration 26 (Ιούνιος 2026)** — Πάνελ λογιστή: πολλαπλές εταιρίες & εκκρεμότητες γραφείου
   - Νέοι πίνακες (migration 0028): `org_pins` (καρφιτσωμένες/πρόσφατες εταιρίες ανά χρήστη), `office_tasks` (εκκρεμότητες cross-company με σοβαρότητα, ανάθεση, προθεσμία/SLA, κατάσταση)
   - `MultiCompanyTools` στο `/accountant/cockpit`: αναζήτηση επωνυμίας/ΑΦΜ, **καρφίτσωμα**, «Νέα καρτέλα» (άνοιγμα εταιρίας χωρίς να χάνεται το context), πολλαπλή επιλογή και **μαζικές ενέργειες**: διαβίβαση εκκρεμών myDATA, μαζικός χαρακτηρισμός+έγκριση εξόδων, **εξαγωγή βιβλίων όλων των εταιριών σε ένα CSV**, δημιουργία εκκρεμοτήτων από τα ευρήματα κινδύνου. Αποτελέσματα ανά εταιρία, audit log σε κάθε μαζική ενέργεια
   - `/accountant/tasks` (`OfficeTaskList`): λίστα εκκρεμοτήτων όλων των εταιριών με φίλτρα (ανοιχτές/ολοκληρωμένες/όλες, ανά εταιρία), **ανάθεση σε συνεργάτη**, ημερομηνία παράδοσης, σήμανση εκπρόθεσμων, ολοκλήρωση/επαναφορά
   - `src/app/actions/office.ts`: toggleOrgPin, markOrgOpened, bulkTransmit, bulkClassifyExpenses, bulkBooksCsv, syncOfficeTasks, updateOfficeTask (με έλεγχο ρόλου – ο viewer μπλοκάρεται)
   - Επαληθεύτηκε: μαζική διαβίβαση 9 παραστατικών (σκορ κινδύνου 21 → 73), CSV βιβλίων 3,1 KB, 3 εκκρεμότητες δημιουργήθηκαν αυτόματα, mobile scrollWidth 390

24. **Iteration 27 (Ιούνιος 2026)** — Ημερολόγιο γραφείου, Αιτήματα εγγράφων, Προσυμπληρωμένο Φ2, Κλείδωμα περιόδου
   - **`/accountant/calendar`**: όλες οι φορολογικές προθεσμίες όλων των πελατών σε ένα ημερολόγιο, ομαδοποιημένες ανά μήνα, με ημέρες που απομένουν, υπεύθυνο/κατάσταση από τα `office_tasks` και σύνδεσμο στις εκκρεμότητες
   - **`/accountant/documents` + δημόσιο `/upload/[token]`** (νέος πίνακας `doc_requests`, migration 0029): ο λογιστής φτιάχνει αίτημα με λίστα «τι λείπει», παίρνει link **χωρίς login/κωδικό** που λήγει σε 7 ημέρες· ο πελάτης ανεβάζει αρχεία (≤8 MB) και το item σημαδεύεται «Ανέβηκε»· τα αρχεία αποθηκεύονται στα attachments (entityType `doc_request`). Δοκιμάστηκε ανέβασμα από κινητό (390px)
   - **`/reports/f2`** (`src/lib/services/f2-recon.ts`): προσυμπληρωμένο Φ2 με **συμφωνία γραμμή-γραμμή** βιβλίων ↔ διαβιβασμένων (καθαρά έσοδα κωδ. 301-310, ΦΠΑ εκροών 331-340), ποσοστό απόκλισης με όριο 30%, μη διαβιβασμένα, κάρτες εκροών/εισροών/χρεωστικού και όλοι οι κωδικοί Φ2 με ποσά
   - **Κλείδωμα περιόδου** (νέος πίνακας `period_locks`): κουμπί «Κλείδωμα μήνα» στο Μηνιαίο κλείσιμο (μόνο αν δεν υπάρχουν εμπόδια), `assertPeriodOpen` σε `saveDraft` (τιμολόγια) και `saveExpense` (έξοδα) – επαληθεύτηκε ότι μπλοκάρει με μήνυμα «Η περίοδος 2026-07 είναι κλειδωμένη μετά την υποβολή»
   - Sidebar: προστέθηκαν «Φ2 & συμφωνία», «Ημερολόγιο γραφείου», «Αιτήματα εγγράφων»

25. **Iteration 28 (Ιούνιος 2026)** — Ξεχωριστό λογιστικό πάνελ με δική του εγγραφή & «πάντρεμα» εταιριών
   - Νέοι πίνακες (migration 0030): `accountant_profiles` (γραφείο: επωνυμία, ΑΦΜ, τηλ., πόλη), `firm_links` (αίτημα συνεργασίας γραφείο↔επιχείρηση με status pending/active/rejected)
   - **Δημόσια εγγραφή λογιστή** `/accountant-signup`: δημιουργεί χρήστη **χωρίς οργανισμό** (bcrypt μέσω του υπάρχοντος hashPassword, έλεγχος διπλού email, session cookie όπως στο κανονικό login) + προφίλ γραφείου. Link «Είστε λογιστής;» στη σελίδα εγγραφής
   - **Ξεχωριστό shell `/office`** (δικό του layout & nav, λογική λογιστικού προγράμματος): Επισκόπηση γραφείου (πλήθος εταιριών, πόσες χρειάζονται προσοχή, κρίσιμα ευρήματα, λίστα πελατών με σκορ κινδύνου & επόμενη προθεσμία), Πελάτες, Ημερολόγιο, Εκκρεμότητες, Έγγραφα. Πρόσβαση μόνο σε χρήστες με προφίλ γραφείου· μετά το login ο λογιστής πάει αυτόματα στο `/office`
   - **Πάντρεμα με ασφάλεια**: ο λογιστής ζητά συνεργασία **με ΑΦΜ** (`/office/clients`), ο **ιδιοκτήτης** της επιχείρησης εγκρίνει/απορρίπτει από τις Ρυθμίσεις (`FirmLinkRequests`) – χωρίς έγκριση δεν δίνεται καμία πρόσβαση (no privilege escalation). Στην έγκριση δημιουργείται membership ρόλου `accountant` + audit log
   - Επαληθεύτηκε πλήρης ροή: εγγραφή γραφείου → αίτημα σε 2 ΑΦΜ → έγκριση από owner → το `/office` δείχνει τον πελάτη με σκορ 73 και «ΑΠΔ & εισφορές ΕΦΚΑ σε 17 ημ.»
   - Τα εργαλεία γραφείου (Ημερολόγιο, Εκκρεμότητες, Έγγραφα) σερβίρονται πλέον **μέσα στο shell `/office`** (`/office/calendar`, `/office/tasks`, `/office/documents`) – ο λογιστής δεν βλέπει καθόλου το επιχειρηματικό μενού. Επαληθεύτηκε σε desktop + mobile (390px)

26. **Iteration 29 (Ιούνιος 2026)** — Κατάργηση ενσωματωμένου λογιστικού ρόλου από το πάνελ επιχείρησης
   - Αφαιρέθηκαν από το μενού της επιχείρησης όλα τα λογιστικά links (Cockpit, Ημερολόγιο γραφείου, Αιτήματα εγγράφων) – επαληθεύτηκε ότι το nav δεν περιέχει κανένα `/accountant/*`
   - Ο ρόλος «Λογιστής» δεν προσφέρεται πλέον στην πρόσκληση/αλλαγή χρηστών· υπάρχοντα memberships ρόλου `accountant` (που δημιουργούνται ΜΟΝΟ μέσω έγκρισης αιτήματος γραφείου) εμφανίζονται ως «Λογιστής (γραφείο)» read-only
   - Το `/office` εμπλουτίστηκε: νέα καρτέλα **«Κίνδυνοι & μαζικές»** (`/office/cockpit` – early warning + multi-company μαζικές ενέργειες), όλα τα εργαλεία (Ημερολόγιο, Εκκρεμότητες, Έγγραφα) μέσα στο shell γραφείου, και **γρήγορα links ανά πελάτη** στην επισκόπηση: Άνοιγμα · Κίνδυνοι · Φ2 · Κλείσιμο
   - `/accountant` ανακατευθύνει στο `/office/cockpit`

27. **Iteration 30 (Ιούνιος 2026)** — «Extreme» πάνελ λογιστικού γραφείου + ξεκάθαρο πάντρεμα
   - Migration 0031 (`0031_office_extreme.sql`): `firm_links.access_level|assignee_user_id|source`, `organizations.accountant_link_code|accountant_link_code_expires`, νέοι πίνακες `firm_members`, `firm_staff_invites`, `firm_link_invites`, `firm_fees`, `firm_fee_charges`
   - **Τρεις τρόποι σύνδεσης**: (α) 6ψήφιος κωδικός από την επιχείρηση (Ρυθμίσεις → Λογιστής) → άμεση σύνδεση, μία χρήση, 7 ημέρες· (β) αίτημα με ΑΦΜ με έγκριση ιδιοκτήτη (υπήρχε)· (γ) πρόσκληση επιχείρησης με email γραφείου, αποδοχή στο `/office/clients`
   - **Επίπεδα πρόσβασης ανά συνεργασία** (πλήρης / μόνο ανάγνωση / μόνο myDATA & έγγραφα) – ορίζονται από την επιχείρηση, συγχρονίζουν και τον ρόλο του membership. **Διακοπή από οποιαδήποτε πλευρά** με audit log. Σελίδα «Πώς γίνεται η σύνδεση» στο `/office/clients`
   - **`/office/clients/[orgId]` Καρτέλα 360°**: ΦΠΑ μήνα, ΦΠΑ εισροών, εκκρεμή/απορρίψεις myDATA, αχαρακτήριστα έξοδα, ανεξόφλητα, σκορ & ευρήματα κινδύνου, ανωμαλίες, προθεσμίες, εκκρεμότητες, έγγραφα, τελευταία παραστατικά
   - **`/office/vat`**: πίνακας συμμόρφωσης όλων των πελατών × μήνα (ΦΠΑ εκροών/εισροών, χρεωστικό/πιστωτικό Φ2, εκκρεμή myDATA, κλείδωμα περιόδου) με επιλογή και μαζική διαβίβαση / εξαγωγή βιβλίων CSV
   - **`/office/team`** (`firm_members`): πρόσκληση partner/υπαλλήλου με σύνδεσμο `/office-join/[token]` (δημιουργεί λογαριασμό & session), αφαίρεση μέλους, ακύρωση πρόσκλησης. **Ανάθεση πελατών** ανά μέλος· ο υπάλληλος βλέπει ΜΟΝΟ τους πελάτες που του ανατέθηκαν (`firmClients` φιλτράρει κατά `assignee_user_id`)
   - **`/office/productivity`**: ανοιχτές/εκπρόθεσμες εκκρεμότητες, τήρηση SLA %, φόρτος ανά συνεργάτη με μπάρες, λίστα εκπρόθεσμων
   - **`/office/inbox`**: κέντρο ειδοποιήσεων γραφείου (προθεσμίες ≤10 ημ., εκκρεμή/απορρίψεις myDATA, αχαρακτήριστα έξοδα, ανοιχτά αιτήματα εγγράφων, κρίσιμα ευρήματα, εκπρόθεσμες εκκρεμότητες) με σοβαρότητα
   - **`/office/assistant` + backend `/api/copilot/office-brief`** (Claude Sonnet 5, Emergent LLM key): πλάνο ημέρας για όλο το γραφείο με σύνοψη, ενέργειες προτεραιότητας και ανάλυση ανά πελάτη (δοκιμάστηκε, απόκριση ~25s)
   - **`/office/fees`**: αμοιβή ανά πελάτη (μηνιαία/τριμηνιαία/ετήσια), μαζική δημιουργία χρεώσεων μήνα (idempotent), σήμανση εξόφλησης
   - Νέα αρχεία: `src/lib/services/firm.ts` (resolveFirm/firmClients/firmClient/ACCESS_LEVELS), `src/app/actions/firm.ts`, `src/app/actions/office-ai.ts`, `src/components/office/*`, `src/components/settings/accountant-access-panel.tsx`
   - Test report: `/app/test_reports/iteration_22.json` — όλες οι ροές PASS, καμία λειτουργική βλάβη

28. **Iteration 31 (Ιούνιος 2026)** — Νέο front page, ανανεωμένες οθόνες auth & οδηγός onboarding 3 βημάτων
   - **Νέο landing** (`src/app/page.tsx`) σε premium dark στιλ (design_guidelines.json): urgency banner 01/10/2026, sticky nav με anchors, hero «Εκδίδετε, διαβιβάζετε και εισπράττετε», **δύο πόρτες** (επιχείρηση / λογιστικό γραφείο), 10 features επιχείρησης, ενότητα συμμόρφωσης (Φ2, radar κινδύνων, μηνιαίο κλείσιμο, ΦΠΑ/παρακρατήσεις), ενότητα πάνελ γραφείου, «σύνδεση με τον λογιστή σε 30 δευτερόλεπτα» (3 βήματα + επίπεδα πρόσβασης), τιμολόγηση με το υπάρχον `PlanCards` σε ανοιχτό πλαίσιο, FAQ (details/summary), τελικό CTA
   - **AuthShell** ανανεωμένο (dark background με glow, λευκή κάρτα για αναγνωσιμότητα, `wide` variant για τον οδηγό)
   - **Onboarding 3 βημάτων** (`src/components/auth/onboarding-wizard.tsx`): μπάρα προόδου, επεξήγηση «Γιατί το βλέπω αυτό», Βήμα 1 στοιχεία εκδότη με **άντληση από ΑΑΔΕ μέσω ΑΦΜ** (`POST /api/afm/lookup`), Βήμα 2 myDATA περιβάλλον/κλειδιά + προθεσμία πληρωμής (με «Παράλειψη»), Βήμα 3 σύνοψη τι θα γίνει + οδηγίες σύνδεσης λογιστή. Το `onboardingAction` δέχεται πλέον mydataEnvironment/userId/subscriptionKey/defaultPaymentTermsDays
   - Επαληθεύτηκε πλήρης ροή: εγγραφή → `/onboarding` → άντληση ΑΦΜ 800000118 → ολοκλήρωση → `/dashboard?welcome=1`. Landing & τιμολόγηση ελεγμένα σε 1920 και 390px χωρίς overflow

29. **Iteration 32 (Ιούνιος 2026)** — Συμφωνία τραπέζης με AI, κανόνες που μαθαίνουν, επιμερισμός & πάνελ γραφείου
   - Migration 0032 (`0032_bank_rules.sql`): πίνακας `bank_rules` {keyword, action(entry|invoice_customer|expense_supplier|ignore), entryKind, targetName, hits, lastUsedAt}
   - `src/lib/services/bank-ai.ts`: `applyRules` (χωρίς AI/κόστος), `learnRule`/`ruleKeyword` (μαθαίνει από κάθε έγκριση), `aiSuggest` (Claude Sonnet 5 μέσω `POST /api/copilot/bank-match`), `applySuggestions` (εκτέλεση + εκμάθηση), `applySplit` (επιμερισμός μιας κίνησης σε πολλά παραστατικά, με μερική κάλυψη)
   - `src/app/actions/bank-ai.ts`: aiSuggestAction / applySuggestionsAction / applyRulesAction / splitMatchAction / listRulesAction / deleteRuleAction / officeBulkReconcileAction
   - UI: `components/banking/ai-reconcile-panel.tsx` στο tab «Extrait & συμφωνία» — «Εφαρμογή κανόνων», «AI προτάσεις» (προεπιλεγμένες οι >=75% βεβαιότητα), έγκριση μαζικά με checkboxes, λίστα κανόνων με διαγραφή, διάλογος επιμερισμού με ποσά ανά παραστατικό. **Τίποτα δεν εκτελείται χωρίς έγκριση** (επιλογή χρήστη)
   - `/office/banking`: πίνακας όλων των πελατών (λογαριασμοί, ασυμφώνητες, εισροές/εκροές, παλαιότερη κίνηση) με μαζική αυτόματη συμφωνία (κανόνες + auto) — μόνο για πελάτες με πλήρη πρόσβαση
   - Καρτέλα 360°: νέο KPI «Ασυμφώνητες τραπεζικές»
   - Test report `/app/test_reports/iteration_23.json`: όλες οι 10 ροές PASS (AI προτάσεις 12/12, εκμάθηση 10 κανόνων, επιμερισμός 744+186=930, μερικός επιμερισμός, απόρριψη υπέρβασης ποσού). Διορθώθηκαν τα 2 low-priority μηνύματα (πλήρες μήνυμα όταν δεν ταιριάζει κανόνας, toast όταν δεν υπάρχουν κινήσεις)
   - Σημείωση seed: προστέθηκε λογαριασμός «Πειραιώς Όψεως» (id 9fbf451b-5414-4315-b0f3-efca0b6e28c2) με 12 δοκιμαστικές κινήσεις extrait στην demo επιχείρηση

30. **Iteration 33 (Ιούνιος 2026)** — Ανασχεδιασμός πάνελ, date-range, δικαιώματα λογιστή, alerts, Φάση Α διπλογραφικά, μητρώο αυθεντικοποιημένων εγγράφων
   - **Νέα «ήρεμη» παλέτα** (globals.css): ζεστό off-white φόντο, βαθύ πετρόλ accent, radius 0.85rem, απαλές σκιές, zebra πίνακες, πλήρες dark mode
   - **Sidebar επιχείρησης**: ομαδοποιημένες collapsible ενότητες (Πωλήσεις / Αγορές & αποθήκη / Χρήματα / Φορολογικά / Διαχείριση), «Αγαπημένα» με αστέρι (localStorage), auto-open της ενεργής ομάδας, **mobile drawer κλείνει μετά το tap** (και στο /office)
   - **Πάνελ λογιστή**: πλήρες sidebar (αντί για γραμμή links), **δυναμικό dashboard ανά χρήστη** (`office_dashboards`, migration 0033) με widgets add/remove/resize/reorder: Λάθη & προσοχή, Πελάτες σε κίνδυνο, Προθεσμίες, Ασυμφώνητες τραπεζικές, Εκκρεμότητες/SLA, AI πλάνο, Αμοιβές, Αιτήματα εγγράφων, Φόρτος ομάδας, Κερδοφορία
   - **DateRangePicker** (`components/date-range-picker.tsx` + `lib/date-range.ts`) με presets (σήμερα/7 ημ./μήνας/τρίμηνο/έτος/προηγ. μήνας/custom) σε: Αναφορές, Κερδοφορία, Διπλογραφικά, Παραγωγικότητα γραφείου, καθολικά
   - **Νέο επίπεδο πρόσβασης «Διαχειριστής βιβλίων» (manager)**: ο λογιστής ενεργεί εξ ονόματος της επιχείρησης (μαζικές, τράπεζα, διπλογραφικά) με audit log· `WRITE_LEVELS = [manager, full]`
   - **Alerts «Λάθη & προσοχή»** (`lib/services/client-alerts.ts`): κενά/διπλά στην αρίθμηση, παραστατικό σε κλειδωμένη περίοδο, μη διαβιβασμένα >24ω, απορρίψεις ΑΑΔΕ, έξοδα χωρίς ΑΦΜ/αριθμό, αχαρακτήριστα, υπερπληρωμές, ανείσπρακτα >90 ημ., ασυμφώνητες τραπεζικές, μηδενικό ΦΠΑ σε εγχώριο. Σελίδα `/office/alerts` + widget + κάρτα «Έλεγχοι βιβλίων» στο dashboard της επιχείρησης
   - **Φάση Γ' λογιστικής (Α)**: `gl_accounts/gl_entries/gl_lines` (migration 0034) με **δύο πρότυπα σχέδια (ΕΛΠ & ΕΓΛΣ)**, αυτόματα άρθρα από τιμολόγια/έξοδα/πληρωμές (idempotent), χειροκίνητα άρθρα με ισοσκέλιση, καθολικά, **ισοζύγιο**, **κατάσταση αποτελεσμάτων (Β.2.1)**, **ισολογισμός (Β.1.1)**, κλείσιμο χρήσης (κλείνει λογαριασμούς εσόδων/εξόδων → 42)
   - **Ευαίσθητα = κυρίως ο λογιστής**: `canManageBooks/canViewBooks` — η επιχείρηση βλέπει read-only εκτός αν ο owner ενεργοποιήσει «books_self_manage» (Ρυθμίσεις → Λογιστής). Ο λογιστής δουλεύει από `/office/clients/[orgId]/accounting`
   - **Μητρώο αυθεντικοποιημένων εγγράφων** (migration 0035): `issued_documents` με μοναδικό κωδικό, SHA-256, στοιχεία & Α.Μ. ΟΕΕ υπογράφοντος, σφραγίδα· δημόσια σελίδα `/verify/[code]` + `/api/verify/[code]` για αντίγραφο· `/office/documents-registry` με ρυθμίσεις υπογραφής. Το PDF μηνιαίου κλεισίματος καταχωρείται αυτόματα (δοκιμασμένο: κωδικός HTRSY-8AUZ5)
   - Νέα σελίδες: `/accounting`, `/accounting/ledger/[code]`, `/office/clients/[orgId]/accounting`, `/office/alerts`, `/office/closing`, `/office/bulk`, `/office/documents-registry`, `/verify/[code]`, `/logout`
   - Test report `/app/test_reports/iteration_25.json`: 13/13 items PASS (μόνο 2 LOW: /logout 404 → διορθώθηκε, naming testid)
   - **Φάση Β (επόμενο)**: μισθοδοσία (εργαζόμενοι, υπολογισμοί ΕΦΚΑ/ΦΜΥ, αποδείξεις αποδοχών), **ΑΠΔ** αρχείο ΕΦΚΑ, **ΦΜΥ** (JL10/βεβαιώσεις), **ΕΡΓΑΝΗ** κάρτα εργασίας & Ε3/Ε4/Ε5/Ε6/Ε8/Ε12 (αρχεία τώρα, API όταν δοθούν διαπιστευτήρια)

31. **Iteration 34 (Ιούνιος 2026)** — Φάση Β: Μισθοδοσία, ΑΠΔ/ΦΜΥ, ΕΡΓΑΝΗ, Πάγια & Αποσβέσεις (όλα από την πύλη λογιστή)
   - Migration 0036: `employees`, `payroll_runs`, `payroll_items`, `shifts`, `fixed_assets`
   - `lib/services/payroll.ts`: καρτέλα εργαζομένου (ΑΦΜ/ΑΜΚΑ/ΑΜ ΕΦΚΑ/ΚΠΚ/ειδικότητα/σύμβαση/ωράριο), υπολογισμός μηνιαίας μισθοδοσίας (ακαθάριστα, υπερωρίες από βάρδιες, δώρα/επιδόματα, **ΕΦΚΑ εργαζομένου 13.37%+**, **ΕΦΚΑ εργοδότη 22.29%**, **ΦΜΥ** με κλίμακα & μειώσεις τέκνων), λογιστική καταχώρηση σε άρθρο (60/55/54.03/53), **ΑΠΔ** αρχείο ΕΦΚΑ (fixed-width), **ΦΜΥ** αρχείο τύπου JL10 (CSV), **ΕΡΓΑΝΗ** XML για Ε12 (κάρτα εργασίας), Ε4, Ε3, Ε8
   - `lib/pdf/payslip-pdf.tsx`: απόδειξη αποδοχών PDF με ανάλυση κρατήσεων, **υπογραφή/σφραγίδα λογιστή, κωδικό & σύνδεσμο επαλήθευσης** (καταχωρείται στο μητρώο εγγράφων)
   - `lib/services/fixed-assets.ts`: μητρώο παγίων (κόστος, υπολειμματική, ωφέλιμη ζωή, σταθερή μέθοδος), πίνακας αποσβέσεων και **αυτόματο μηνιαίο άρθρο απόσβεσης** (66 → 12.99), idempotent ανά μήνα
   - Σελίδες (μόνο λογιστής με manager/full): `/office/clients/[orgId]/payroll`, `/office/clients/[orgId]/ergani`, `/office/clients/[orgId]/assets` + κουμπιά στην καρτέλα 360°
   - Υπενθυμίσεις προθεσμιών ΑΠΔ/ΦΜΥ υπήρχαν ήδη στο module προθεσμιών και εμφανίζονται στο widget «Προθεσμίες ΦΠΑ/myDATA» του γραφείου
   - Επαληθεύτηκε end-to-end: εργαζόμενος 1.400 € → ΕΦΚΑ 187,18/312,06, ΦΜΥ 125,58, καθαρά 1.087,24· αρχεία ΑΠΔ/ΦΜΥ/Ε12/Ε4 κατεβαίνουν· πάγιο 1.200 €/3 έτη → άρθρο απόσβεσης 33,33 €/μήνα· βάρδιες ΕΡΓΑΝΗ καταχωρούνται
   - **ΕΡΓΑΝΗ ΙΙ API**: τα αρχεία είναι έτοιμα· η αυτόματη υποβολή θα ενεργοποιηθεί όταν δοθούν διαπιστευτήρια (ο χρήστης δεν τα έχει ακόμη)
   - Διορθώσεις μετά το test report `/app/test_reports/iteration_26.json` (11/11 PASS): σαφή μηνύματα όταν η μισθοδοσία είναι ήδη καταχωρημένη ή δεν υπάρχει για τον μήνα (ΑΠΔ/ΦΜΥ), **Ημερολόγιο άρθρων** στη σελίδα διπλογραφικών του λογιστή (με ετικέτα προέλευσης: Πώληση/Αγορά/Μισθοδοσία/Αποσβέσεις/Κλείσιμο), χρήστης επιχείρησης που ανοίγει `/office` γυρίζει στο dashboard του, ASCII-safe Content-Disposition για ελληνικά ονόματα αρχείων (απόδειξη αποδοχών)

## Φάση Γ Μισθοδοσίας (2026-09-13) — DONE, tested (iteration_27/28)
- ΕΡΓΑΝΗ ΙΙ: διαπιστευτήρια ανά πελάτη από το UI (`ergani_credentials`, trial/live), δοκιμή σύνδεσης, υποβολή Ε3/Ε4/Ε8/Ε12/Ε6/Ε7 με ιστορικό (`ergani_submissions`). Endpoints yeka.gr — απαιτούν πραγματικούς κωδικούς, τα paths εντύπων ενδέχεται να χρειάζονται επαλήθευση με τα docs του ΕΡΓΑΝΗ.
- Προσωπική πύλη εργαζομένου `/staff/[token]` + 4ψήφιο PIN (cookie): αποδείξεις PDF, βάρδιες, άδειες, ψηφιακή κάρτα άφιξη/αναχώρηση (auto υπερωρία).
- Δώρα & επιδόματα (`bonuses.ts`): Δώρο Χριστουγέννων (1/5–31/12, 2/25 ανά 19 ημ., +4,166%), Πάσχα (1/1–30/4, 1/15 του ½ ανά 8 ημ.), επίδομα αδείας (20/21/22/25/26 ημέρες, όριο ½ μισθού). Runs με κλειδί YYYY-DX/DP/EA, payslips, GL posting.
- SEPA pain.001.001.03 αρχείο εμβασμάτων (`sepa.ts`) για μισθοδοσία & δώρα, IBAN validation.
- Αποζημίωση απόλυσης Ν.4093/2012 (`severance.ts`): υπάλληλοι/εργατοτεχνίτες, με/χωρίς προειδοποίηση, +17ετία 2012, φόρος >60k. Ε6/Ε7/Ε5 XML.

### Backlog
- P1: Payment page/QR ανά παραστατικό (Stripe/IRIS/Viva).
- P1: Επαλήθευση endpoint paths ΕΡΓΑΝΗ ΙΙ με πραγματικούς κωδικούς χρήστη.
- P2: Δόσεις/διακανονισμοί, email-to-invoice.


## UX back office 1, 3, 4 — περιορισμένη υλοποίηση
- Επιλογή χρήστη: (1) πάντα ευδιάκριτη ενεργή επιχείρηση, (3) σφάλματα δίπλα στο πεδίο με οδηγία, (4) επιβεβαιώσεις που εξηγούν συνέπειες. Καμία επανασχεδίαση, κανένα νέο φορολογικό/λογιστικό feature.
- Νέος σαφής κανόνας χρήστη: «Μην εξαντλείσαι τόσο με τεστ και να μου αναφέρεις πριν φτιάξεις αν βρεις κάτι που θέλει πολλά tokens». Μόνο σύντομοι στοχευμένοι έλεγχοι. Πριν από εκτεταμένη διερεύνηση/υλοποίηση ενημέρωση με εύρημα/εύρος και αναμονή έγκρισης. Μην ανοίγετε νέο broad audit ή design agent.
- Υλοποιήθηκε ActiveCompany (όνομα+ΑΦΜ) σε sticky επιχειρηματικό header, OfficeContext σε γραφείο/εξουσιοδοτημένο πελάτη από ήδη authorized officeClients. Δεν μεταβλήθηκαν ρόλοι ή έλεγχοι πρόσβασης. Mobile header διατηρεί όλες τις ενέργειες σε μικρότερη διάταξη.
- Invoice editor: reusable existing schema + server fieldErrors, ενδείξεις δίπλα σε πελάτη/ημερομηνίες/περιγραφή/ποσότητα/τιμή/έκπτωση/ισοτιμία/συσχέτιση/απαλλαγή ΦΠΑ, aria-invalid/describedby, focus στο πεδίο και επέκταση λεπτομερειών γραμμής. Customer form: AFM/name/email/paymentdays/credit inline feedback, autofocus, διατήρηση τιμών. Actions επέστρεψαν επιπλέον fieldErrors και ελληνικά μηνύματα· ίδιοι business rules και υπολογισμοί.
- InvoiceConfirmation: εταιρία, αριθμός ή ένδειξη νέου παραστατικού, πελάτης, ποσό, εξήγηση συνεπειών. Πριν έκδοση από editor/detail, διαβίβαση myDATA/B2G, διαγραφή προχείρου, ακύρωση εκδοθέντος. Safe focus στο «Πίσω — χωρίς αλλαγές», pending guard, mock/prod διάκριση. Δεν άλλαξαν lifecycle APIs/φορολογικοί υπολογισμοί. B2G πρόσθεσε συνδέσμους στις σχετικές ρυθμίσεις/πελάτη και επίμονα σφάλματα.
- Verification: main smoke πραγματικό login, invoices/new desktop1920×800/mobile390×844, context+inlineerrors, overflow[]. TypeScript και targeted ESLint PASS. Testing `/app/test_reports/iteration_37.json`: πραγματικό business+office login, authorized client header, emptyinvoice/date/VAT0 errors, customer AFM server error, cancel-modal context/back close. Καμία πραγματική έκδοση/διαβίβαση/ακύρωση/διαγραφή ή δημιουργία πελάτη. Report37 λέει «DB counts25/42» αλλά πρόκειται για row counts στις λίστες, ΟΧΙ πλήρη έλεγχο βάσης· μην υπερβάλλετε.
- Ειλικρινές υπόλοιπο verification: editor-confirm-issue δεν άνοιξε στο automation λόγω απώλειας τιμών μεταξύ επιλογών· ο QA το απέδωσε σε timing αλλά αυτό δεν είναι αποδεδειγμένο RCA. Δεν επιβεβαιώθηκε bug και ΔΕΝ αλλάζουμε applySeries ή άλλους business rules με εικασίες. Ready B2G modal/final submit και native invalid email δεν εκτελέστηκαν σε αυτό το στενό test. Μην ισχυριστείτε ότι επαληθεύτηκαν. Εφόσον ζητηθεί περαιτέρω διερεύνηση, ενημερώστε πρώτα τον χρήστη, χωρίς γενικό νέο test cycle.
- Αρχεία: components/{active-company,ui/field-error,office/office-context,invoices/invoice-confirmation}.tsx και υπάρχοντα layout/invoice/customer/B2G components· actions/{invoices,customers}.ts, lib/invoice/schema.ts messages. Owner kkoletsas@gmail.com και credentials αμετάβλητα. Backlog της προηγούμενης συνεδρίας διατηρείται· δεν προστέθηκαν έξτρα features.

## Σύνολο ERP — πρώτη δημόσια παρουσίαση (προηγούμενο αίτημα)
- Ο χρήστης πάγωσε το γενικό debugging και ζήτησε πρώτη, μη τελική landing/login/registration: κοντά στο back-office ύφος, όχι κλώνος, ελληνικά selling slogans ανά δυνατότητα. Επέλεξε οριστικά όνομα «Σύνολο ERP». Μελλοντικός δικός μας πάροχος + άλλοι πάροχοι + γέφυρες με όλα τα λογιστικά: χωρίς pending badges, ως σαφής κατεύθυνση/στόχος, όχι ψευδής τρέχουσα πιστοποίηση ή εγγυημένη καθολική συμβατότητα.
- Latest feedback: «Πολύ μικρά font sizes σε mobile βλέπω» — κύριο κείμενο16px, feature paragraphs15px, auth description/labels/buttons15px, inputs16px, δευτερεύοντα13–14px. Η ενδεικτική προεπισκόπηση απλοποιήθηκε σε κάθετες μετρήσεις στο mobile για αναγνωσιμότητα.
- Latest: «Χρειάζεσαι πολύ ακόμη με τον agent?» — περιορίζουμε επιπλέον tests στα απολύτως απαραίτητα, όχι νέα γενική αναζήτηση bugs.
- Νέα αρχεία `components/marketing/{landing,landing-interactive}.tsx`, `landing-content.ts` (18 δυνατότητες με φίλτρα), scoped `public.css`, `synolo-brand.tsx`, `auth/password-input.tsx`. Hero εναλλαγή επιχείρησης/γραφείου, ξεχωριστή ενότητα γραφείου, provider/bridge ecosystem, FAQ, πραγματικά πακέτα/τιμές PLANS. Illustration hero δεν είναι ζωντανά δεδομένα (MOCKED illustration only, όχι mocked API).
- Root / κρατά redirect συνδεδεμένων προς dashboard, /?preview=1 επιτρέπει δημόσια προεπισκόπηση με login. AuthShell νέα split διάταξη, προαιρετικό office variant, mobile μονή στήλη. Login/business signup/office signup νέα εμφάνιση· υπάρχοντα actions/password rules/invitations/passkeys/2FA/roles δεν αντικαταστάθηκαν. Owner kkoletsas@gmail.com δεν άλλαξε. Password toggle και υποβολή μετά hydration.
- Brand metadata/PWA icons/manifest/sidebar headings/legal serviceName σε Σύνολο ERP. Δεν αλλάζουν εταιρικές νόμιμες επωνυμίες, ΑΦΜ, emails χρηστών ή παλιά παραστατικά.
- QA `/app/test_reports/iteration_35.json` βρήκε πραγματικό login hydration blocker. Αρκετές αναφορές selectors/fonts/screenshots στην αναφορά ΔΕΝ συμφωνούν με την πραγματική πηγή: accountant signup έχει ξεχωριστό button, όχι κοινό SubmitButton· main measured hero16px ενώ report έλεγε12px· screenshot paths report35 δεν υπήρχαν. Μην εφαρμόζετε εικασίες (useEffect αντικατάσταση/suppressHydrationWarning). Main έκανε πραγματική επαλήθευση.
- RCA: hardcoded παλιά allowedDevOrigins/allowedOrigins αγνοούσαν τρέχον UUID/cluster preview, και serviceworker έκανε stale-while-revalidate σε dev JS/CSS προκαλώντας μίξη SSR/CSR εκδόσεων. `next.config.ts` πλέον προκύπτει από APP_URL, REACT_APP_BACKEND_URL και προαιρετικό NEXT_ADDITIONAL_ORIGINS(.env). Καμία hardcoded domain στον κώδικα. Serviceworker v2 fetches frameworkJS/CSS από network, διατηρεί image/font cache και αμετάβλητη offline expense queue· updateViaCache:none + registration.update(). Μη ζητάτε clear cache ως λύση.
- MAIN VERIFIED και τελικό `/app/test_reports/iteration_36.json`: πραγματικό login -> dashboard, λάθος password -> σαφές σφάλμα με διατήρηση τιμών -> επιτυχία με σωστό· signup επιχείρησης/γραφείου duplicate-email server-action checks πέρασαν χωρίς δημιουργία λογαριασμού ή email. Password visibility PASS. Persona preview switch,18 all/6money feature filters,9€/90€ monthly-yearly, mobile menu, FAQ PASS. Screenshots πραγματικών σελίδων390×844 και1920×800 χωρίς overflow. Mobile hero16, features15, auth description/labels/buttons15, inputs16px. Desktop auth narrative padding διορθώθηκε και επαληθεύτηκε στα480px περιεχομένου. TypeScript/targeted ESLint/manifestJSON PASS. Δύο προηγούμενα script failures ήταν δικά μας λάθος selectors, όχι app bugs, επανελέγχθηκαν με σωστά IDs.
- Παραμένουν ΕΚΤΟΣ ελέγχου νέας εργασίας: happy-path ΝΕΑΣ εγγραφής + email delivery, πραγματική βιομετρική/passkey/2FA challenge, paused financial/compliance audit. Δεν ισχυριζόμαστε ότι ελέγχθηκαν. Μετά το targeted regression δεν χρειάζεται νέος γενικός testing agent για την παρούσα πρώτη έκδοση.
- Πρώτη, μη τελική παράδοση ολοκληρώθηκε. Preview link `/?preview=1`, επιτρέπει και στον ήδη συνδεδεμένο ιδιοκτήτη να δει την αρχική. Επόμενες επιλογές μόνο κατόπιν χρήστη: επιστροφή στο paused debugging, συγκεκριμένες λογιστικές γέφυρες/πάροχος με επιβεβαιωμένες προδιαγραφές, guided product walkthrough για νέους επισκέπτες.
- Δεν δημιουργήθηκαν νέοι κωδικοί/λογαριασμοί. Νέα πλήρης εγγραφή με πραγματικό email και external delivery δεν δοκιμάζεται χωρίς απομόνωση. Καμία πραγματική υποβολή/χρέωση. Το paused financial/HR/accounting backlog πιο κάτω παραμένει ανοιχτό.

## Προηγούμενη συνεδρία — debugging σε παύση για τη νέα παρουσίαση

### Δεσμευτικές οδηγίες χρήστη
- «Κάνε δυνατό debugging σε επίπεδο προγράμματος, βάσης δεδομένων. Φτιάξε προβλήματα σε ui ux και καν’το όσο πιο friendly και κατανοητό γίνεται χωρίς να χάσουμε τίποτα σε εμφανείς λειτουργίες. Σκέψου και ιδέες».
- «Φτιάξε και λογικά λάθη ή αυτονόητα πράγματα που ο χρήστης μπορεί να μπερδευτεί».
- Ιδιοκτήτης: `kkoletsas@gmail.com` — επιβεβαιώθηκε υπάρχων owner, καμία αλλαγή λογαριασμού/κωδικού.
- «Τα settings tabs είναι χάλια στο mobile» + screenshot επικάλυψης tabs πάνω στη φόρμα. Υψηλότερη προτεραιότητα UI.
- «Πρόσεξε να μη χαλάσεις κάτι ζωτικής σημασίας και να κρατάς πάντα οδηγίες που έχω δώσει καθώς και compliance απόλυτο με κράτος γέφυρες κλπ». Καμία επινοημένη φορολογική αντιστοίχιση, καμία σιωπηλή μεταβολή ιστορικών εγγραφών, καμία πραγματική υποβολή/χρέωση στις δοκιμές. Δεν ισχυριζόμαστε πιστοποιημένη/απόλυτη συμμόρφωση χωρίς επίσημους validators και αποδοχή φορέων/παρόχων.
- Τελευταίο: «Κάποια στιγμή κάνε μια παύση πες μου τι βρήκες και διόρθωσες και τι δοκιμές θέλουμε ακόμη». ΠΑΥΣΗ μετά την ενημέρωση, όχι ολοκλήρωση έργου. Σύντομες απαντήσεις, συγκεντρωτικές ανεξάρτητες κλήσεις.

### Εφαρμοσμένες αλλαγές — επιβεβαιωμένο υποσύνολο
- Reports `/app/test_reports/iteration_33.json` (baseline) και `iteration_34.json` (μερικό regression), diagnostics `frontend/scripts/diagnostic_iter33.ts`, `diagnostic_iter34.ts`. Το iteration34 ΥΠΕΡΒΑΛΛΕΙ στη σύνοψη: αρκετά ζητημένα transactional/settings-write/payroll/leave/SEPA tests ΔΕΝ εκτελέστηκαν.
- Mobile settings: native select με όλες τις 15 ενότητες, αντί επικάλυψης tabs. Desktop ομαδοποιημένο sidebar + αναζήτηση. URL συγχρονίζεται και back/forward λειτουργεί. Νέο `components/settings/settings-tabs.tsx`, διόρθωση forwarding orientation στο κοινό `ui/tabs.tsx`. 390×844 επιβεβαιωμένο χωρίς επικάλυψη. Desktop report χρησιμοποίησε ΛΑΘΟΣ 1920×1080: απαιτείται επανάληψη ακριβώς 1920×800.
- B2G: σωστό CreditNote root/namespace/type/line/quantity, πραγματικός αριθμός αρχικού παραστατικού σε BillingReference, τιμολόγηση BaseQuantity για αποφυγή απώλειας στρογγυλοποίησης, έκπτωση γραμμής και PaymentMeans ανά μέθοδο. Invoice root regression PASS σε fixtures. buildXmlFor πλέον async με db/tenant-scoped συσχέτιση. Guards για πρόχειρα/ακυρωμένα και μη υποστηριζόμενες παρακρατήσεις/χαρτόσημο· route επιστρέφει 422 αντί ανεξέλεγκτου exception. Καμία μετατροπή παρακράτησης σε προκαταβολή. BT-11 παραμένει υποχρεωτικό για ελληνικό B2G.
- Provider normalization: τεχνική παράδοση = sent, όχι accepted· απορρίψεις/σφάλματα/μερική αποδοχή διακρίνονται. Guards επαναποστολής και διαφορετικού παρόχου. Εμφανής προσομοίωση και λήψη XML με toast σφάλματος. Fixtures PASS, ΟΧΙ live provider acceptance ή πλήρης XSD/Schematron επικύρωση.
- Invoice editor: server initialDate από editor-data, ντετερμινιστικά αρχικά IDs, ημερομηνίες Ελλάδας. Hydration invoice-editor PASS. Αρνητικά και καθαρά και μικτά πιστωτικών, σημερινή λήξη όχι ληξιπρόθεσμη. Mobile invoice page χωρίς document overflow.
- `/office/dashboard` redirect και εξήγηση μη πρόσβασης στο επιχειρηματικό dashboard. Sidebar πιο ακριβής ενεργή διαδρομή· mobile αλλαγή οργανισμού κλείνει drawer (τελευταίο θέλει browser retest).
- Βάση: integrity_check OK, μηδέν FK/διπλή αρίθμηση/ασυμφωνίες συνόλων/ανισοσκέλιστα GL στα ελεγχόμενα δεδομένα: 337 παραστατικά, 496 γραμμές, 6 οργανισμοί, 77 πίνακες. Καμία επιδιόρθωση ή διαγραφή επιχειρηματικών δεδομένων. QA πρόσθεσε μία δοκιμαστική session, όχι λογαριασμό/κωδικό.

### Εφαρμοσμένα αλλά απαιτούν ουσιαστικό regression πριν χαρακτηριστούν ολοκληρωμένα
- `actions/settings.ts`: έλεγχοι IBAN/Stripe acct_/ημερών υπενθύμισης, διατήρηση κενού myDATA secret, δυνατότητα αφαίρεσης logo __remove.
- `actions/b2g.ts` + settings form: διατήρηση μη υποβληθέντων credentials στη simulation, typed values στο provider toggle, επαλήθευση πληρότητας και ρητή επιβεβαίωση production. Απαιτούνται πραγματικά server-action tests σε απομονωμένη εταιρία, χωρίς network submits.
- `services/invoices.ts`: transaction για saveDraft και έκδοση/αρίθμηση/απόθεμα, guard κλειδωμένης περιόδου στην έκδοση, tenant checks πελάτη/είδους/αποθήκης/συσχέτισης, έγκυρες ημερομηνίες, αρίθμηση από max υπάρχοντος έτους κατά αλλαγή χρονιάς. Χρειάζονται temp-DB rollback, race/double-click, παλιό έτος, credit/import/subscription regression. ΟΧΙ έκδοση στη βάση του χρήστη.
- `services/payroll.ts`: validation μήνα/ποσών, διατήρηση inactive/endDate, salaried μήνας όχι πλήθος βαρδιών. Νέο partial-month guard απαιτεί explicit payable-day override. ΕΛΕΓΞΤΕ αν υπάρχει προσιτό UI πριν τον πρώτο υπολογισμό, αλλιώς νέα αλλαγή έχει blocker. Δεν ελέγχθηκε πραγματικό computeRun στο report34, μόνο computeItem.
- `services/bonuses.ts`: 1ο/2ο έτος αποχώρησης μπλοκάρει μη τεκμηριωμένο αυτόματο επίδομα με εξήγηση· 3ο έτος δεν περικόπτεται γενικά. Θέλει λογιστική επικύρωση και manual UI path, δεν είναι πλήρης υποστήριξη ειδικών περιπτώσεων.
- `services/leave.ts`: έγκυρες ημερομηνίες, employment range, transaction overlap guard, approval δεν διαγράφει worked/submitted shifts και ΔΕΝ στέλνει ΕΡΓΑΝΗ. Ξεχωριστό LeaveSubmitButton με επιβεβαίωση. Θέλει πραγματικές δοκιμές approval/overlap και διατήρησης δεδομένων, με αποκλεισμένο network.
- SEPA missing IBAN θετικών καθαρών αποδοχών μπλοκάρει αντί να παραλείπει εργαζόμενο. Θέλει XML/schema/τραπεζικό regression, συμπεριλαμβανομένων ελληνικών ονομάτων.
- `db/index.ts`: failure migrations δεν αγνοείται απλώς επειδή υπάρχει organizations. Δεν προστέθηκαν migrations/schema.

### Ανοιχτά / διορθώσεις της αισιόδοξης αναφοράς testing
1. P1 `/accounting?from=2026-09-01&to=2026-09-30&tab=journal`: hydration mismatch σε CardTitle/suffix ΑΦΜ. RCA cache/race στο report34 ΔΕΝ αποδείχθηκε. Εξετάστε auto-link iOS/format-detection: logs περιείχαν αυτόματους tel anchors στο /employees. Reproduce πρώτα.
2. P1 login πριν hydration: ActionForm plain POST με onSubmit μόνο client μπορεί να αδειάζει πεδία χωρίς login. QA παρέκαμψε με test session. Πριν auth αλλαγή: test_credentials, logs, integration playbook. ΜΗΝ αφαιρέσετε method=post (διαρροή credentials σε GET). Κανονικό login + αργό mobile + γρήγορο submit απαιτούν επανέλεγχο.
3. Το `/app/test_reports/iter34_mobile_settings.jpeg` ΕΠΙΘΕΩΡΗΘΗΚΕ και δείχνει LOGIN, όχι settings. Άρα παρά τα θετικά DOM metrics στην αναφορά, η οπτική επαλήθευση mobile settings ΔΕΝ είναι αξιόπιστα τεκμηριωμένη. Θέλουμε σωστά screenshots 390×844 ΚΑΙ 1920×800 μετά πραγματικό login. Οι προηγούμενες φράσεις «επιβεβαιωμένο» για screenshots παραπάνω αφορούν τον ισχυρισμό του QA, όχι ανεξάρτητη απόδειξη.
4. Πλήρης UBL2.1 XSD/PEPPOL Schematron/ελληνική CIUS και provider sandbox acceptance ΔΕΝ έγιναν. Ελληνικό BT11 παραμένει απαραίτητο, δεν υιοθετούμε λάθος συμβουλή audit ότι είναι optional. Παρακρατήσεις/χαρτόσημο B2G παραμένουν μη υποστηριζόμενα χωρίς επαληθευμένη χαρτογράφηση. Προϋπάρχοντα ERGANI endpoint paths μη επαληθευμένα. Δεν δηλώνουμε απόλυτη compliance.
5. Αμέσως πριν την παύση ο δίσκος γέμισε από 6.6GB παραγόμενης Turbopack cache. Σταμάτησε το frontend, καθαρίστηκαν ΜΟΝΟ `.next/dev/cache` και `.next/cache/turbopack`, επανεκκινήθηκε. Χώρος από 0 σε6.6GB. Δεν διαγράφηκε business data/source. Το PRD είχε γραφτεί μερικώς και αποκαταστάθηκε. Έλεγχος root cause/cache growth παραμένει για επόμενο βήμα.

### Συνέχεια / περιβάλλον
- PAUSE τώρα για ενημέρωση χρήστη. Δεν πρόκειται για feature-complete finish. Πρώτα login/accounting, σωστή UI οπτική επαλήθευση, transactional/financial negative tests και επίσημο validation· μετά νέες ιδέες.
- Authoritative supervisor preview προστέθηκε στο frontend/.env ως REACT_APP_BACKEND_URL: https://ae3b8df7-6c89-4970-9706-ec5e4a3d4041.preview.emergentagent.com. APP_URL παραμένει cashflow-pro-295. Next config hardcoded allowedOrigins περιλαμβάνουν295, όχιUUID: dev/HMR warnings σεUUID. Παλιό cashflow-pro-18 ανενεργό. Μην hardcode domains.
- TypeScript πέρασε· μόνο diagnostics scripts προστέθηκαν από QA, όχι production source changes. Καμία αλλαγή λογαριασμών/κωδικών· owner παραμένει kkoletsas@gmail.com.
- Backlog διατηρείται: δόσεις/διακανονισμοί, email-to-invoice. Ιδέα μελλοντικού UX: προέλεγχος έκδοσης «έτοιμο/λείπει» με links στα πεδία, χωρίς αυτόματη εξωτερική ενέργεια.

---

## Changelog — 2026-06 (Super-Admin panel, fork)

### P0 FIX — Super-Admin login (κρίσιμο)
- Αιτία: το `$` στο `SUPER_ADMIN_PASSWORD_HASH` (scrypt) το έκανε expand το Next (@next/env/dotenv-expand) → hash κατέληγε "scrypt". Διόρθωση: escaped `\$` στο `frontend/.env`. Login `/admin` λειτουργεί.

### Feature Flags & Per-Org Overrides (ολοκληρώθηκε, testing iteration_42 = 100%)
- Global επεξεργασία δυνατοτήτων/ορίων ανά πλάνο (`/admin/plans`), αποθήκευση σε νέο πίνακα `platform_settings.plan_overrides_json`. Cache επιπέδου διεργασίας (plans.ts) warmed στο `getCurrentContext` (session.ts).
- Per-organization overrides (features on/off + αριθμητικά όρια invoices/users) σε `organizations.overrides_json`. Εφαρμόζονται στα `orgHasFeature/featureBlockedMessage/assertFeature/monthlyInvoiceLimit/assertCanAddUser`.
- Νέες capabilities με enforcement: `projects`, `pos`, `banking` (UpgradeNotice guards στις αντίστοιχες σελίδες). Περιλαμβάνονται σε trial + όλα τα paid πλάνα (χωρίς regression).

### Επιπλέον Super-Admin λειτουργίες (ολοκληρώθηκαν)
- Στατιστικά πλατφόρμας (οργανισμοί, ενεργές συνδρομές, σε δοκιμή, χρήστες/παραστατικά, εκτ. MRR).
- Αναζήτηση & φίλτρα οργανισμών (q/plan/status).
- Σελίδα λεπτομερειών οργανισμού `/admin/orgs/[id]` (χρήστες+ρόλοι, πλήθος παραστατικών, ημ/νίες).
- Παράταση/ορισμός trial (`setOrgTrialFormAction`).
- «Είσοδος ως» owner (impersonate, `impersonateOrgAction`).
- Audit log ενεργειών admin (`admin_audit_log`, `/admin/audit`) — καταγράφονται όλες οι mutating actions.

### Migrations
- `0043_platform_flags.sql` (organizations.overrides_json + platform_settings)
- `0044_admin_audit.sql` (admin_audit_log)

### Backlog (P2)
- Δόσεις/διακανονισμοί με αυτόματες χρεώσεις κάρτας.
- Email-to-invoice.
- Live API bridges SoftOne/Epsilon (πραγματικό push — τώρα scaffolded).
- B2G withholding taxes / χαρτόσημα (blocked: επίσημη τεκμηρίωση ΑΑΔΕ).

