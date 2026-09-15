# Iteration 30 — Ευρήματα (Ελληνικά)

Διαγνωστικός γύρος. Δεν έγιναν αλλαγές στην εφαρμογή. Δεν στάλθηκε τίποτα σε ΕΡΓΑΝΗ/ΑΑΔΕ/B2G, δεν χρεώθηκαν κάρτες, δεν στάλθηκαν emails, δεν άλλαξαν διαπιστευτήρια.

## HIGH — Επιβεβαιωμένα σφάλματα

1. **SEPA XML: Όλα τα ονόματα εργαζομένων γίνονται `EMPLOYEE`**  
   `sepa.ts:latin()` (γρ. 6‑12) αφαιρεί κάθε ελληνικό χαρακτήρα (regex `[^A-Za-z0-9 …]`) και επιστρέφει `"EMPLOYEE"` αν το αποτέλεσμα είναι κενό. Επαλήθευση με Node: `latin('Παπαδόπουλος Νίκος')` → `"EMPLOYEE"`. Στο e‑banking κάθε συναλλαγή εμφανίζεται ως `EMPLOYEE`.  
   _Fix_: Χάρτης μεταγραφής ΕΛΟΤ‑743 (Α→A, Β→V, Γ→G, Θ→TH, Χ→CH, κτλ.) πριν το fallback.

2. **Άδειες: αποδέχεται διπλά/επικαλυπτόμενα αιτήματα**  
   `leave.ts:createLeaveRequest` (γρ. 36‑48) εισάγει χωρίς έλεγχο overlap. Αναπαραγωγή: δύο ίδια αιτήματα 2026‑11‑16→17 από τη πύλη → **2 σειρές «Εκκρεμεί»** στο DB. Στην έγκριση θα δημιουργήσει διπλές βάρδιες και θα υποβάλει **δύο** LEAVE στην ΕΡΓΑΝΗ.  
   _Fix_: `SELECT … WHERE employeeId=? AND status IN ('pending','approved') AND fromDate<=? AND toDate>=?` και throw «υπάρχει επικαλυπτόμενο αίτημα».

3. **Επίδομα αδείας: αγνοεί `endDate` εργαζομένου**  
   `bonuses.ts:leaveDays` (γρ. 39‑51) υπολογίζει με βάση `hireDate` και `Date.UTC(year,11,31)`, δεν κόβει στο `endDate`. Ένας εργαζόμενος με αποχώρηση 31/1/2026 λαμβάνει πλήρες ετήσιο επίδομα άδειας. Ασυνέπεια με `christmasBonus/easterBonus` που χρησιμοποιούν σωστά `daysWithin(hire, end)`.  
   _Fix_: prorate με `workdaysBetween(max(hire,'YYYY-01-01'), min(end,'YYYY-12-31'))`.

4. **Έγκριση άδειας → αυτόματη ΖΩΝΤΑΝΗ υποβολή ΕΡΓΑΝΗ**  
   `leave.ts:decideLeaveRequest` (γρ. 62‑78): μόλις εγκριθεί, καλείται `submitErgani('LEAVE',…)` χωρίς επιπλέον beklad. Στον demo οργανισμό `fa82eab8‑…` το mode είναι **live** (από iteration 29). Ένα κλικ = πραγματική υποβολή.  
   _Fix_: checkbox «Και υποβολή στην ΕΡΓΑΝΗ» ή default preparation-only σε mode=live.

## MEDIUM

5. **Email dialog τιμολογίου**: λείπει πεδίο «Θέμα» και data‑testid. (`invoice-actions.tsx:469‑522`).
6. **Payments UI**: τα Stripe keys ζουν μόνο στο `.env`, δεν υπάρχει tab «Πληρωμές» στα Ρυθμίσεις.
7. **Discoverability Ειδοποιήσεων**: το `NotificationPrefsCard` υπάρχει στο `/account` αλλά δεν υπάρχει link ή tab από το `/settings`.

## LOW

8. Native `input[type=date]` σε staff portal / payments / recurring — US placeholder σε ελληνική εφαρμογή.
9. `API_RATE_LIMIT=120` χωρίς endpoint scoping → 429 σε γρήγορη πλοήγηση.

## Ενστάσεις στα ευρήματα iteration_29 (challenged)

- «Λείπει PEPPOL subscription key» → **ΛΑΘΟΣ**. Υπάρχει conditionally για EPSILON (`providers.ts:60`, `b2g-settings-form.tsx:113‑131`, testid `b2g-field-b2gSubscriptionKey`).
- «Ειδοποιήσεις λείπουν παντελώς — HIGH» → **ΛΑΘΟΣ**. Υπάρχουν στο `/account`; το πρόβλημα είναι placement/discoverability.
- «Placeholder `missing-field` σε ΤΠ‑0007 — HIGH» → **ΛΥΘΗΚΕ**. SQL `SELECT description FROM invoice_lines WHERE description LIKE '%missing%'` = 0 σειρές.
- «Draft B2G disabled είναι bug» → **ΛΑΘΟΣ**. Είναι σωστή συμπεριφορά (`b2g-card.tsx:38-112`, `invoice-actions.tsx:148-169`).

## Καθαρισμός test data

`DELETE FROM leave_requests WHERE reason LIKE 'QA_AUDIT_30%'` → 2 rows removed. Καμία άλλη εγγραφή.
