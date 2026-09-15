# Πρότυπα Σχεδιασμού & UI/UX «Σύνολο ERP» (Design Standards Blueprint)

> **Σκοπός**: Καθορισμός ενιαίου, υψηλού επιπέδου σχεδιαστικού προτύπου (Design System & UI/UX Standards) για όλα τα περιβάλλοντα του **Σύνολο ERP**: το Backoffice Επιχείρησης (`/dashboard`, `/invoices`, `/quotes`, `/customers`, κλπ.) και το Panel Λογιστικού Γραφείου (`/office/*`).

---

## 1. Φιλοσοφία Πλοήγησης (Navigation Philosophy)

Όλες οι σελίδες της εφαρμογής, ανεξαρτήτως ρόλου (Επιχείρηση ή Λογιστικό Γραφείο), ακολουθούν **μια ενιαία αρχιτεκτονική πλοήγησης**.

### 1.1 Δομή Sidebars & Ομαδοποίηση
* **Business Backoffice Sidebar** (`components/app-sidebar.tsx`):
  * **Κύρια Ενότητα**: Πίνακας Ελέγχου (`/dashboard`), Έσοδα (`/invoices`, `/quotes`, `/pos`), Έξοδα (`/expenses`, `/suppliers`), Επαφές (`/customers`), Τράπεζες (`/banking`), Αποθήκη (`/products`, `/inventory`), Αναφορές (`/reports`).
  * **Ενότητα Συμμόρφωσης**: myDATA (`/mydata`), Λογιστική (`/accounting`).
  * **Ενότητα Ρυθμίσεων**: Ρυθμίσεις (`/settings`), Λογαριασμός (`/account`).
* **Accountant Office Panel Sidebar** (`components/office/office-sidebar.tsx`):
  * **Κύρια Ενότητα**: Cockpit Γραφείου (`/office/cockpit`), Inbox Ευρημάτων (`/office/inbox`), Πελάτες Γραφείου (`/office/clients`), Εργασίες & Ημερολόγιο (`/office/tasks`, `/office/calendar`).
  * **Ενότητα Φορολογίας & Εργαλείων**: ΦΠΑ & Φόροι (`/office/vat`), Αμοιβές (`/office/fees`), Έγγραφα (`/office/documents`), Μαζικά Εργαλεία (`/office/bulk`), Ομάδα (`/office/team`).

### 1.2 Κανόνες Active States & Ενεργειών
* **Ενεργό Στοιχείο Μενού**: `bg-sidebar-accent text-sidebar-accent-foreground font-medium rounded-lg px-3 py-2 transition-colors`.
* **Πρωτεύουσα Ενέργεια Δημιουργίας («Νέο ...»)**:
  * **Κανόνας**: Η κύρια ενέργεια (π.χ. `+ Νέο Παραστατικό`, `+ Νέος Πελάτης`, `+ Νέα Εργασία`) τοποθετείται **πάντα στο δεξί μέρος του `PageHeader`** της εκάστοτε σελίδας.
  * **Δεν** τοποθετούνται κουμπιά δημιουργίας μέσα στη Sidebar για αποφυγή οπτικού θορύβου.

### 1.3 Top Bar & Breadcrumbs
* **Top Bar Περιεχόμενο**:
  * Αριστερά: `SidebarTrigger` (κουμπί συμπτυγμένης/ανεπτυγμένης sidebar), `Breadcrumbs`.
  * Κέντρο/Δεξιά: Πεδίο Γρήγορης Αναζήτησης (Cmd+K Command Palette), Επιλογέας Ενεργής Εταιρείας (`ActiveCompanySelector`), Ειδοποιήσεις (`NotificationBell`), Εναλλάκτης Θέματος (`ThemeToggle`), Προφίλ Χρήστη.
* **Κανόνας Breadcrumbs**:
  * Μορφή: `Αρχική > Κατηγορία > Τρέχουσα Σελίδα` (π.χ. `Αρχική > Έσοδα > Τιμολόγια`).
  * CSS: `text-sm text-muted-foreground` με `hover:text-foreground` στα ενδιάμεσα links.

### 1.4 Mobile Navigation (390px)
* Η Sidebar συμπτύσσεται σε **Slide-over Sheet/Drawer**.
* Το Top Bar παραμένει καθηλωμένο (`sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b`).
* Ελάχιστη περιοχή αγγίγματος (Touch Target): **44px x 44px** (`h-11 w-11` ή `py-2.5`).

---

## 2. Πρότυπο Ανατομίας Σελίδας (Page Anatomy Template)

Κάθε σελίδα λίστας ή διαχείρισης ακολουθεί αυστηρά την παρακάτω κατακόρυφη αλληλουχία:

```
┌────────────────────────────────────────────────────────────────────────┐
│ PageHeader (Τίτλος + Περιγραφή + Breadcrumbs + Primary CTA "+ Νέο")    │
├────────────────────────────────────────────────────────────────────────┤
│ KPI Strip (4 Κάρτες Στατιστικών - Προαιρετικό)                       │
├────────────────────────────────────────────────────────────────────────┤
│ FilterBar (Αναζήτηση + Date Range «από — έως» + Φίλτρα + Καθαρισμός)  │
├────────────────────────────────────────────────────────────────────────┤
│ TableShell / Grid Cards (Πίνακας Δεδομένων με Sticky Header)           │
├────────────────────────────────────────────────────────────────────────┤
│ ListPagination (25/50/100/200, «X–Y από Z», Πλοήγηση Σελίδων)         │
└────────────────────────────────────────────────────────────────────────┘
```

### Ακριβή Spacing Tokens (Tailwind CSS)
* **Κύριο Layout Container**: `space-y-6 p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto w-full min-w-0`
* **PageHeader**: `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/40`
* **KPI Strip Grid**: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`
* **FilterBar Wrapper**: `bg-card rounded-xl border border-border/70 p-4 space-y-3 shadow-sm`
* **Table Wrapper**: `rounded-xl border border-border/70 bg-card overflow-hidden shadow-sm`
* **ListPagination Wrapper**: `flex flex-col sm:flex-row items-center justify-between gap-4 py-3 px-4 bg-card border border-border/70 rounded-xl`

---

## 3. Πρότυπα Εξαρτημάτων (Component Standards)

### 3.1 Πίνακες Δεδομένων (Tables & TableShell)
* **Sticky Header**: `sticky top-0 bg-muted/60 z-10 backdrop-blur-sm border-b font-semibold text-xs uppercase tracking-wider text-muted-foreground`
* **Στοίχιση Αριθμών & Ποσών**:
  * **Πάντα Δεξιά** (`text-right font-mono tabular-nums`).
  * Παράδειγμα: `1.234,56 €`
* **Περικοπή Κειμένου (Truncation)**:
  * Ονόματα/Περιγραφές: `truncate max-w-[180px] md:max-w-[260px]` συνοδευόμενα από `Tooltip` αν περικόπτονται.
* **Ενέργειες Γραμμής (Row Actions)**:
  * Η τελευταία στήλη δεξιά (`w-[50px] text-right`) περιλαμβάνει `DropdownMenu` με εικονίδιο τριών κουκκίδων (`MoreHorizontal`).
  * `data-testid="row-actions-btn"`
* **Πυκνότητα Γραμμών (Row Density)**:
  * Κανονική: `py-3 px-4 text-sm`
  * Συμπαγής (Compact): `py-2 px-3 text-xs`

### 3.2 Κάρτες KPI (KPI Cards)
```tsx
<Card className="rounded-xl border border-border/70 bg-card p-5 space-y-2 shadow-sm hover:border-primary/30 transition-all">
  <div className="flex items-center justify-between">
    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Σύνολο Εσόδων</span>
    <Euro className="h-4 w-4 text-muted-foreground" />
  </div>
  <div className="flex items-baseline justify-between">
    <span className="text-2xl font-bold tracking-tight font-mono">14.280,50 €</span>
    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400">
      +12.4%
    </Badge>
  </div>
</Card>
```

### 3.3 Status Badges & Σημασιολογικός Χάρτης Χρωμάτων (Color Semantics Map)
Όλα τα status badges (Τιμολογίων, myDATA, Εξόδων, Εργασιών, Ευρημάτων) ακολουθούν **μια ενιαία χρωματική σημασιολογία**:

| Κατάσταση / Έννοια | Παραδείγματα | Tailwind Classes (Light / Dark) |
| :--- | :--- | :--- |
| **Επιτυχές / Εξοφλημένο / Valid** | Εξοφλήθηκε, myDATA Valid, Ολοκληρώθηκε | `bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800` |
| **Εκκρεμότητα / Προειδοποίηση** | Μεριστικώς Εξοφλημένο, myDATA Pending, Μεσαία Σοβαρότητα | `bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800` |
| **Σφάλμα / Ληξιπρόθεσμο / Κρίσιμο** | Ληξιπρόθεσμο, myDATA Error, Υψηλή Σοβαρότητα, Ακυρωμένο | `bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800` |
| **Πρόχειρο / Ουδέτερο / Αρχείο** | Πρόχειρο (Draft), Αρχειοθετημένο, Πληροφορία | `bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700` |
| **Επεξεργασία / Διαβιβάστηκε** | Διαβιβάστηκε, Σε Εξέλιξη, Syncing | `bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800` |

### 3.4 Ιεραρχία Κουμπιών (Buttons Hierarchy)
* **Πρωτεύον (Primary CTA)**: ΜΟΝΟ ΕΝΑ ανά οπτική περιοχή/σελίδα.
  * `className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm font-medium"`
* **Δευτερεύον (Secondary)**: Για συνοδευτικές ενέργειες (π.χ. Εξαγωγή Excel, Φίλτρα).
  * `variant="outline"` (`border-input bg-background hover:bg-accent hover:text-accent-foreground`)
* **Τριτεύον / Inline Actions**:
  * `variant="ghost"` (`hover:bg-accent hover:text-accent-foreground`)
* **Καταστροφικό (Destructive)**: Για διαγραφές/ακυρώσεις.
  * `variant="destructive"`

### 3.5 Φόρμες & Πεδία Εισαγωγής (Forms & Inputs)
* **Labels**: `text-sm font-medium text-foreground mb-1.5 block`
* **Placeholders**:
  * Πεδία Αναζήτησης: `«Αναζήτηση με ΑΦΜ, επωνυμία, αριθμό...»`
  * Πεδία Ημερομηνίας: `«από — έως»`
* **Help Text**: `text-xs text-muted-foreground mt-1`
* **Error Text**: `text-xs font-medium text-destructive mt-1.5 flex items-center gap-1`

### 3.6 Empty States
Όταν μια λίστα ή ένας πίνακας δεν έχει δεδομένα, εμφανίζεται **πάντα** ένα καθαρό Empty State:
```tsx
<div className="flex flex-col items-center justify-center py-12 px-4 text-center border rounded-xl bg-card/50">
  <div className="p-3 rounded-full bg-muted mb-3">
    <FileText className="h-6 w-6 text-muted-foreground" />
  </div>
  <h3 className="text-base font-semibold text-foreground">Δεν βρέθηκαν παραστατικά</h3>
  <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
    Δεν υπάρχουν εγγραφές που να αντιστοιχούν στα φίλτρα αναζήτησης.
  </p>
  <Button variant="outline" onClick={resetFilters}>Καθαρισμός Φίλτρων</Button>
</div>
```

### 3.7 Dialogs vs Sheets vs Toasts
* **Sheet (Slide-over)**: Χρησιμοποιείται για εκτενείς φόρμες ή προεπισκοπήσεις (π.χ. Προβολή λεπτομερειών τιμολογίου, Σύνθετα Φίλτρα).
* **Dialog (Modal)**: Χρησιμοποιείται για σύντομες επιβεβαιώσεις (π.χ. Ακύρωση παραστατικού, Διαγραφή) ή γρήγορες καταχωρήσεις 1-3 πεδίων.
* **Toasts**: Ειδοποιήσεις αποτελέσματος μέσω `sonner` (`toast.success('Το παραστατικό εκδόθηκε επιτυχώς')`, `toast.error('Αποτυχία διαβίβασης στο myDATA')`).

---

## 4. Τυπογραφία & Μορφοποίηση (el-GR)

### 4.1 Μορφοποίηση Νομίσματος & Αριθμών
* **Νόμισμα**: Χρήση `Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' })`
  * Σωστό: `1.234,56 €`
  * Λάθος: `$1234.56`, `1234.56 EUR`
* **Ποσοστά**: `24,0%` (με κόμμα για υποδιαστολή).
* **ΑΦΜ**: 9 ψηφία με έλεγχο εγκυρότητας (π.χ. `094000000`).

### 4.2 Μορφοποίηση Ημερομηνιών
* **Σύντομη μορφή**: `23/03/2026`
* **Πλήρης μορφή**: `23 Μαρτίου 2026`
* **Πεδίο Εύρους Ημερομηνιών (Date Range)**: `από — έως`

---

## 5. Σύστημα Χρωμάτων (OKLCH Color Palette)

```css
:root {
  --background: oklch(0.975 0.006 85);       /* Ζεστό off-white */
  --foreground: oklch(0.22 0.012 220);       /* Σκούρο πετρόλ/γκρι */
  --card: oklch(1 0.002 85);                 /* Καθαρό λευκό */
  --primary: oklch(0.45 0.075 200);          /* Βαθύ Πετρόλ */
  --primary-foreground: oklch(0.99 0.005 85);
  --secondary: oklch(0.955 0.008 85);
  --accent: oklch(0.94 0.018 195);
  --border: oklch(0.9 0.008 85);
}

.dark {
  --background: oklch(0.18 0.014 225);      /* Σκούρο μπλε/γκρι */
  --foreground: oklch(0.95 0.006 200);      /* Φωτεινό off-white */
  --card: oklch(0.225 0.017 222);            /* Σκούρα κάρτα */
  --primary: oklch(0.7 0.1 195);            /* Φωτεινό Πετρόλ */
  --border: oklch(1 0 0 / 12%);
}
```

---

## 6. Κανόνες Responsive & Πρόληψης Overflow

1. **Min-Width Zero (`min-w-0`)**: Κάθε flex child ή grid item που περιέχει κείμενο πρέπει να έχει `min-w-0` ώστε να λειτουργεί το `truncate`.
2. **Οριζόντια Κύλιση Πινάκων (`overflow-x-auto`)**: Όλοι οι πίνακες περικλείονται σε `<div className="overflow-x-auto w-full">`.
3. **Breakpoints**:
   * Mobile: `< 640px` (390px target) - Συμπτυγμένα φίλτρα, μονοστήλη διάταξη KPI.
   * Tablet: `640px - 1024px` - Διστηλη διάταξη KPI, οριζόντιο FilterBar.
   * Desktop: `> 1024px` - Πλήρης ανάπτυξη πινάκων και πλευρικών πάνελ.

---

## 7. Λίστα Ελέγχου (Audit Checklist) για κάθε Σελίδα

Πριν θεωρηθεί μια σελίδα ολοκληρωμένη, πρέπει να ικανοποιεί τα παρακάτω 10 σημεία:

- [ ] **1. PageHeader**: Υπάρχει τίτλος, περιγραφή, breadcrumb & πρωτεύον κουμπί "+ Νέο ..." δεξιά (αν απαιτείται).
- [ ] **2. FilterBar**: Περιλαμβάνει πεδίο αναζήτησης με placeholder, Date Range «από — έως», επιλογή καταστάσεων & κουμπί «Καθαρισμός».
- [ ] **3. Table Format**: Sticky header, δεξιά στοίχιση ποσών (`font-mono tabular-nums`), σωστά status badges.
- [ ] **4. Row Actions**: Η τελευταία στήλη έχει `DropdownMenu` με `data-testid="row-actions-btn"`.
- [ ] **5. Pagination**: Υπάρχει το `ListPagination` με επιλογές 25/50/100/200 και προεπιλογή το 25.
- [ ] **6. Responsive (390px)**: Δεν υπάρχει οριζόντιο overflow στη σελίδα (εκτός από το εσωτερικό scroll του πίνακα).
- [ ] **7. Empty State**: Εμφανίζεται φιλικό empty state όταν δεν υπάρχουν αποτελέσματα.
- [ ] **8. Currency & Dates**: Όλα τα ποσά έχουν μορφή `1.234,56 €` και οι ημερομηνίες `DD/MM/YYYY`.
- [ ] **9. Dark Mode**: Όλα τα στοιχεία (cards, badges, inputs, borders) είναι αναγνώσιμα στο σκούρο θέμα.
- [ ] **10. Test IDs**: Όλα τα διαδραστικά στοιχεία διαθέτουν `data-testid` (kebab-case).

---

## 8. Ιεράρχηση Ανασχεδιασμού (Priority Refactoring List)

1. **Παραστατικά & Έγγραφα (`/invoices`, `/quotes`, `/expenses`)**:
   * Εφαρμογή του νέου `FilterBar` με εύρος ημερομηνιών «από — έως» και προεπιλογή 25 εγγραφών στο `ListPagination`.
2. **Dashboard Επιχείρησης (`/dashboard`) & Λογιστή (`/office/dashboard`)**:
   * Σταθεροποίηση KPI cards, εναρμόνιση γραφημάτων και αφαίρεση τυχαίων περιθωρίων.
3. **Cockpit Λογιστή & Inbox Ευρημάτων (`/office/cockpit`, `/office/inbox`)**:
   * Εφαρμογή του ενιαίου πίνακα TableShell με σημασιολογικά status badges για τη σοβαρότητα ευρημάτων.
4. **Πελάτες & Προμηθευτές (`/customers`, `/suppliers`)**:
   * Εναρμόνιση πινάκων, προσθήκη φίλτρων ΑΦΜ/Υπολοίπου και ομοιόμορφα modals καταχώρησης.
5. **myDATA & Accounting Bridge (`/mydata`, `/accounting`)**:
   * Ενιαίος σχεδιασμός καταστάσεων διαβίβασης και αντιστοίχισης λογαριασμών.
