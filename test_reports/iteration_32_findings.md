# Iteration 32 — Ευρήματα (Ελληνικά)

**Σκοπός**: ελαφρύς αθροιστικός έλεγχος (UI smoke + code-level diagnostic re-run). Χωρίς επιδιορθώσεις, χωρίς LIVE side-effects.

## Real logins (πρώτη φορά επιτυχή σε αυτό το iteration)
- `demo@timologio.gr / demo1234` → `/dashboard` (Επισκόπηση) ✅
- `office@koletsas.gr / office1234` → `/office` (Λογιστικό Γραφείο Κολέτσας) ✅
- Μέθοδος: ActionForm + Enter μετά από `wait_until='networkidle'` στη σελίδα login. **Δεν χρειάστηκε παράκαμψη** με tc_session cookie από SQLite (contra iter30/31 caveat).

## Coverage matrix (routes)
| Group | Total | 200 OK | Fails |
|---|---|---|---|
| Business nav | 23 | 21 | /accounting → **429 Cloudflare** (throttle, όχι bug), όλα τα υπόλοιπα OK |
| Office nav | 18 | 17 | **`/office/dashboard` → 404** (LOW UI bug) |
| Office client (demo org) | 6 | 6 | — |

Όλα τα headings αντιστοιχούν στην αναμενόμενη σελίδα (Παραστατικά, Πελάτες, myDATA – Συμφωνία & διαβίβαση, ΕΡΓΑΝΗ · Κάρτα εργασίας, Διπλογραφικά · … κ.ο.κ.). Καμία runtime error δεν εντοπίστηκε στα `[class*="error"]` selectors.

## Στοχευμένα UI checks
- **Settings ?tab=b2g**: 15 tabs ορατοί, «Δημόσιο (B2G)» με `data-state=active`. Screenshot: φαίνονται Ενεργοποίηση B2G, Αυτόματη αποστολή, Πάροχος (Προσομοίωση), Περιβάλλον (UAT), ΑΦΜ παρόχου 090165560. Μετά reload το URL διατηρεί `?tab=b2g`. ✅
- **Invoice list `/invoices`**: 173 παραστατικά, φίλτρα (Πρόχειρα, Εκδοθέντα, Εξοφλημένα, Ακυρωμένα, Εκκρεμή myDATA, Δελτία αποστολής, Εκκρεμή Δημοσίου, Απορρίψεις Δημοσίου), δουλεύουν tabs. ✅
- **Invoice PDF**: `/api/invoices/{id}/pdf` → 200, application/pdf, 28.8 KB, **PNG render OK** — λογότυπο, στοιχεία εκδότη/λήπτη, γραμμή, ΦΠΑ, MARK, UID, Authentication Code, footer με πάροχο, όλα στη θέση τους (`/tmp/iter32_invoice-1.png`). ✅
- **Employees office ?month=2026-10**: heading «Προσωπικό», κουμπιά «Μαζικές ενέργειες» + «Νέος εργαζόμενος», search input. ✅
- **Mobile 390×844 `/office`**: layout responsive, header ορατός, hamburger visible (αριστερά επάνω), toasters count = **1** (κανένα διπλό Toaster). ✅

## Code-level bugs (re-confirmed μέσω `diagnostic_iter31.ts`, exit 0)

### CRITICAL
1. **PEPPOL BR-CO-15 (διόρθωση από iter31 που έλεγε λάθος BR-CO-13)** — `buildPeppolInvoiceXml` σε τιμολόγιο με παρακράτηση (net 100, ΦΠΑ 24, withheld 20, gross 104):
   - `TaxExclusive=100`, `TaxAmount=24`, `TaxInclusive=104`
   - Απαιτούμενο: `TaxInclusive = TaxExclusive + TaxAmount = 124`
   - Επιπλέον: **δεν** εκπέμπεται `cac:WithholdingTaxTotal` (BT-88). PEPPOL validation θα απορρίψει.
2. **Credit note root wrong** — `buildPeppolInvoiceXml` σε invoiceType='5.1' βγάζει `<Invoice>` + `InvoiceTypeCode>381`, αντί `<CreditNote xmlns=CreditNote-2>` + `CreditNoteTypeCode>381`. UBL 2.1 spec violation.
3. **`computeRun` days source για μισθωτούς** — `payroll.ts:157` περνάει `days: overrides.days ?? empShifts.length`. Salaried με 1 shift row → gross πέφτει από **1200€ σε 48€** (verified: `days_25.gross=1200 net=955.57`, `days_1.gross=48 net=41.58`).

### HIGH
4. **`normalizeStatus`** (`b2g/providers.ts:172-178`) — regex substring precedence: `'not accepted'` → `accepted`, `'unsuccessful'` → `accepted` (η ρίζα «accept»/«success» ματσάρει πρώτη).
5. **`athensIso`** (`ergani-api.ts:30-35`) — verified μέσω πραγματικού `workCardPayload` export:
   - `2026-01-15T10:00:00Z` → `f_date="2026-01-15T12:00:00+00:00"` (Athens wall-clock αλλά offset UTC)
   - `2026-07-15T10:00:00Z` → `f_date="2026-07-15T13:00:00+00:00"`
   - Container TZ=UTC. Αναμενόμενο `+02:00`/`+03:00`. **Drift 2-3h** στα E12 arrivals/departures.
6. **`leaveAllowance` αγνοεί endDate** — `bonuses.ts:93`. Employee με hire 2026-01-01 και endDate 2026-01-31 παίρνει ΤΟ ΙΔΙΟ 600€ όπως ένας με endDate=null (και οι δύο 20 ημέρες × 48€, cap 600€).

### MEDIUM
7. **`validateB2G` κανένα guard για cancelled/void** — `services/b2g.ts:16-37`. Cancelled τιμολόγιο (status='cancelled') επιστρέφει `errors=[]` και μπορεί να διαβιβαστεί στο Δημόσιο. Μόνο 'draft' απορρίπτεται.

### LOW (UI)
8. **`/office/dashboard` → 404** «Η σελίδα δεν βρέθηκε». Είτε rewrite προς `/office`, είτε αφαίρεση από τυχόν nav item.

## Ανασκευές προηγούμενων reports
- `computeRun` **ΟΝΤΩΣ** φιλτράρει `e.active` (payroll.ts:143) — απολυμένοι με `active=false` εξαιρούνται (iter≤29 claim λάθος).
- «Όλοι οι Ιανουαρίου λήγοντες απαιτούν proration τρίτου έτους» **δεν** αποδείχθηκε — το πραγματικό bug είναι στενότερο (endDate ignored σε leaveAllowance).
- Το PEPPOL rule είναι **BR-CO-15**, όχι BR-CO-13 όπως αναφερόταν στο iter31.

## Πράγματα που ΔΕΝ ελέγχθηκαν (per scope)
- Καμία πραγματική αποστολή ΕΡΓΑΝΗ/myDATA/B2G/email/payment.
- Καμία έγκριση αδείας, κανένα clock-in/out (LIVE side-effects, mismatched employer).
- Payslip PDF: `/api/office/clients/{org}/payroll/2026-09/pdf` και `/api/payroll/2026-09/pdf` επιστρέφουν 404 — δεν έγινε deeper search για το πραγματικό export endpoint.
- SEPA sepaPayrollFile: όχι executed (χρειάζεται isolated fixture DB per scope).
- Sidebar double-active: automated class-regex selectors επέστρεψαν 0 items — το active state χρησιμοποιεί inline Tailwind που δεν πιάνεται· χρειάζεται manual visual compare ή explicit `aria-current` στο source. **Feature gap**, όχι επιβεβαιωμένο bug.
- Staff portal PIN session (κανένα new leave/clock write έγινε).

## Distinguished status per finding
| # | Severity | Kind |
|---|---|---|
| 1-2 | CRITICAL | runtime-confirmed via real UBL emit |
| 3, 6, 7 | CRITICAL/HIGH/MEDIUM | code-only (calc/logic reproduced via real module invocation) |
| 4 | HIGH | code-only (real normalizeStatus call) |
| 5 | HIGH | runtime-confirmed via workCardPayload export |
| 8 | LOW | runtime-confirmed via real HTTP 404 |
| Sidebar double-active | — | **blocked** (selector coverage insufficient, no visual evidence of duplication) |
| Payslip PDF | — | **feature gap or endpoint discovery required** |

## Αρχεία που πειράχθηκαν σε αυτό το iteration
- **Κανένα app source file**.
- Επιβεβαιώθηκε ότι το `/app/frontend/scripts/diagnostic_iter31.ts` έχει ήδη τις μικρές διορθώσεις που ζητήθηκαν (AFM 800000118, import πραγματικού `workCardPayload`, winter/summer f_date extraction).

## Artifacts
- `/tmp/iter32_invoice.pdf` (28.8 KB, valid PDF)
- `/tmp/iter32_invoice-1.png` (PNG render του invoice PDF — οπτικά επιβεβαιωμένο)
- `/tmp/iter32_office_mobile.jpeg` (mobile /office layout)
