export type MarketplaceTemplate = {
  id: string;
  label: string;
  description: string;
  series: { code: string; name: string; invoiceType: string }[];
  products: {
    name: string;
    sku: string;
    unitPrice: number;
    vatCategory: number;
    classificationCategory: string;
    classificationType: string;
    measurementUnit: number;
    category: string;
  }[];
};

export const TEMPLATES: Record<string, MarketplaceTemplate> = {
  lawyer: {
    id: "lawyer",
    label: "Δικηγόρος",
    description: "ΤΠΥ, γραμμάτιο ΔΣΑ, συμβουλευτική.",
    series: [
      { code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών", invoiceType: "2.1" },
      { code: "ΑΠΥ", name: "Απόδειξη Παροχής Υπηρεσιών Λιανικής", invoiceType: "11.2" },
    ],
    products: [
      { name: "Ωριαία αμοιβή νομικής συμβουλευτικής", sku: "LEGAL-HR", unitPrice: 100, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 3, category: "Υπηρεσίες" },
      { name: "Σύνταξη αγωγής/εξωδίκου", sku: "LEGAL-DOC", unitPrice: 250, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Υπηρεσίες" },
      { name: "Παράσταση σε ακροατήριο", sku: "LEGAL-CRT", unitPrice: 400, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Υπηρεσίες" },
    ],
  },
  doctor: {
    id: "doctor",
    label: "Ιατρός",
    description: "ΑΠΥ με απαλλαγή ΦΠΑ (Άρθρο 22).",
    series: [
      { code: "ΑΠΥ", name: "Απόδειξη Παροχής Ιατρικών Υπηρεσιών", invoiceType: "11.2" },
      { code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών (ασφαλιστικά)", invoiceType: "2.1" },
    ],
    products: [
      { name: "Πρώτη επίσκεψη", sku: "MED-FIRST", unitPrice: 60, vatCategory: 7, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Υπηρεσίες" },
      { name: "Επανεξέταση", sku: "MED-FOLLOW", unitPrice: 40, vatCategory: 7, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Υπηρεσίες" },
      { name: "Ιατρική βεβαίωση", sku: "MED-CERT", unitPrice: 20, vatCategory: 7, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Υπηρεσίες" },
    ],
  },
  engineer: {
    id: "engineer",
    label: "Μηχανικός",
    description: "Μελέτες, επιβλέψεις, τεχνικές εκθέσεις.",
    series: [
      { code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών", invoiceType: "2.1" },
      { code: "ΤΠ", name: "Τιμολόγιο Πώλησης (εξοπλισμός)", invoiceType: "1.1" },
    ],
    products: [
      { name: "Στατική μελέτη", sku: "ENG-STA", unitPrice: 1500, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Μελέτες" },
      { name: "Επίβλεψη έργου (ημέρα)", sku: "ENG-SUP", unitPrice: 300, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Υπηρεσίες" },
      { name: "Ενεργειακό πιστοποιητικό", sku: "ENG-PEA", unitPrice: 250, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Μελέτες" },
    ],
  },
  eshop: {
    id: "eshop",
    label: "E-shop",
    description: "ΑΛΠ, ΤΠ B2B, επιστροφές.",
    series: [
      { code: "ΑΛΠ", name: "Απόδειξη Λιανικής Πώλησης", invoiceType: "11.1" },
      { code: "ΤΠ", name: "Τιμολόγιο Πώλησης", invoiceType: "1.1" },
      { code: "ΠΤ", name: "Πιστωτικό Τιμολόγιο", invoiceType: "5.1" },
    ],
    products: [
      { name: "Δείγμα προϊόντος e-shop", sku: "ESHOP-001", unitPrice: 29.9, vatCategory: 1, classificationCategory: "category1_1", classificationType: "E3_561_001", measurementUnit: 1, category: "Προϊόντα" },
    ],
  },
  hospitality: {
    id: "hospitality",
    label: "Τουριστικό κατάλυμα",
    description: "ΑΠΥ, τέλος διαμονής, τέλος ανθεκτικότητας κλίματος.",
    series: [
      { code: "ΑΠΥ", name: "Απόδειξη Παροχής Υπηρεσιών Καταλύματος", invoiceType: "11.2" },
      { code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών (πρακτορεία)", invoiceType: "2.1" },
    ],
    products: [
      { name: "Διανυκτέρευση δωματίου (χωρίς πρωινό)", sku: "HOTEL-NIGHT", unitPrice: 80, vatCategory: 3, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Διαμονή" },
      { name: "Πρωινό ανά άτομο", sku: "HOTEL-BFAST", unitPrice: 12, vatCategory: 2, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Εστίαση" },
      { name: "Τέλος διαμονής (ανά διανυκτέρευση)", sku: "HOTEL-TAX", unitPrice: 1.5, vatCategory: 8, classificationCategory: "category1_95", classificationType: "E3_596", measurementUnit: 1, category: "Τέλη" },
      { name: "Τέλος ανθεκτικότητας κλιματικής κρίσης", sku: "HOTEL-CLIMATE", unitPrice: 2.0, vatCategory: 8, classificationCategory: "category1_95", classificationType: "E3_596", measurementUnit: 1, category: "Τέλη" },
    ],
  },
  tutoring: {
    id: "tutoring",
    label: "Φροντιστήριο",
    description: "ΑΠΥ μαθημάτων με απαλλαγή ΦΠΑ (εκπαίδευση).",
    series: [
      { code: "ΑΠΥ", name: "Απόδειξη Παροχής Εκπαιδευτικών Υπηρεσιών", invoiceType: "11.2" },
      { code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών (εταιρείες)", invoiceType: "2.1" },
    ],
    products: [
      { name: "Μηνιαία συνδρομή Γενικής Παιδείας", sku: "TUT-GEN", unitPrice: 180, vatCategory: 7, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Μαθήματα" },
      { name: "Ιδιαίτερο μάθημα (ώρα)", sku: "TUT-PRIV", unitPrice: 25, vatCategory: 7, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 3, category: "Μαθήματα" },
      { name: "Υλικό μαθήματος", sku: "TUT-BOOK", unitPrice: 15, vatCategory: 3, classificationCategory: "category1_1", classificationType: "E3_561_001", measurementUnit: 1, category: "Υλικό" },
    ],
  },
  gym: {
    id: "gym",
    label: "Γυμναστήριο / Studio",
    description: "Συνδρομές, ημερήσια επίσκεψη, personal training.",
    series: [
      { code: "ΑΠΥ", name: "Απόδειξη Παροχής Υπηρεσιών", invoiceType: "11.2" },
      { code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών (εταιρίες)", invoiceType: "2.1" },
    ],
    products: [
      { name: "Μηνιαία συνδρομή", sku: "GYM-MONTHLY", unitPrice: 45, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Συνδρομές" },
      { name: "Τρίμηνη συνδρομή", sku: "GYM-Q", unitPrice: 120, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Συνδρομές" },
      { name: "Ημερήσια επίσκεψη", sku: "GYM-DAY", unitPrice: 8, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Επισκέψεις" },
      { name: "Personal Training (session)", sku: "GYM-PT", unitPrice: 30, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Υπηρεσίες" },
    ],
  },
  restaurant: {
    id: "restaurant",
    label: "Εστίαση",
    description: "ΑΛΠ κατανάλωσης, delivery, τέλος επιδόσεων.",
    series: [
      { code: "ΑΛΠ", name: "Απόδειξη Λιανικής (κατανάλωση επί τόπου)", invoiceType: "11.1" },
      { code: "ΑΛΠ-Δ", name: "ΑΛΠ Delivery / Take-away", invoiceType: "11.1" },
      { code: "ΤΠ", name: "Τιμολόγιο Πώλησης (catering)", invoiceType: "1.1" },
    ],
    products: [
      { name: "Δείγμα φαγητού (menu item)", sku: "REST-DISH", unitPrice: 12, vatCategory: 2, classificationCategory: "category1_1", classificationType: "E3_561_001", measurementUnit: 1, category: "Φαγητό" },
      { name: "Αναψυκτικό/Νερό", sku: "REST-DRINK", unitPrice: 3, vatCategory: 1, classificationCategory: "category1_1", classificationType: "E3_561_001", measurementUnit: 1, category: "Ποτά" },
      { name: "Κρασί ποτήρι", sku: "REST-WINE", unitPrice: 6, vatCategory: 1, classificationCategory: "category1_1", classificationType: "E3_561_001", measurementUnit: 1, category: "Ποτά" },
    ],
  },
  freelancer: {
    id: "freelancer",
    label: "Ελεύθερος επαγγελματίας IT",
    description: "ΤΠΥ project, retainer, ενδοκοινοτικές υπηρεσίες.",
    series: [
      { code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών", invoiceType: "2.1" },
      { code: "ΤΠΥ-ΕΕ", name: "ΤΠΥ Ενδοκοινοτικό (reverse charge)", invoiceType: "2.2" },
      { code: "ΑΠΥ", name: "Απόδειξη Παροχής Υπηρεσιών Λιανικής", invoiceType: "11.2" },
    ],
    products: [
      { name: "Ώρα ανάπτυξης λογισμικού", sku: "IT-DEV-HR", unitPrice: 55, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 3, category: "Υπηρεσίες" },
      { name: "Μηνιαίο retainer υποστήριξης", sku: "IT-RETAINER", unitPrice: 800, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Συμβόλαια" },
      { name: "Cloud infrastructure setup", sku: "IT-CLOUD", unitPrice: 500, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Υπηρεσίες" },
      { name: "Web development (ενδοκοινοτική)", sku: "IT-EU-DEV", unitPrice: 60, vatCategory: 7, classificationCategory: "category1_3", classificationType: "E3_561_005", measurementUnit: 3, category: "Υπηρεσίες" },
    ],
  },
  hairdresser: {
    id: "hairdresser",
    label: "Κομμωτήριο / Beauty",
    description: "ΑΛΠ κοπής, χτενίσματος, spa.",
    series: [
      { code: "ΑΛΠ", name: "Απόδειξη Λιανικής Πώλησης", invoiceType: "11.1" },
      { code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών (εταιρίες)", invoiceType: "2.1" },
    ],
    products: [
      { name: "Κούρεμα ανδρικό", sku: "HAIR-M", unitPrice: 15, vatCategory: 2, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Υπηρεσίες" },
      { name: "Κούρεμα γυναικείο", sku: "HAIR-W", unitPrice: 25, vatCategory: 2, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Υπηρεσίες" },
      { name: "Βαφή μαλλιών", sku: "HAIR-COLOR", unitPrice: 45, vatCategory: 2, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Υπηρεσίες" },
      { name: "Χτένισμα", sku: "HAIR-STYLE", unitPrice: 20, vatCategory: 2, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Υπηρεσίες" },
    ],
  },
  pharmacy: {
    id: "pharmacy",
    label: "Φαρμακείο",
    description: "ΑΛΠ, ΑΛΠ ΕΟΠΥΥ, ΤΠ σε εταιρίες.",
    series: [
      { code: "ΑΛΠ", name: "Απόδειξη Λιανικής", invoiceType: "11.1" },
      { code: "ΑΛΠ-Σ", name: "ΑΛΠ Συνταγογραφούμενα (ΕΟΠΥΥ)", invoiceType: "11.1" },
      { code: "ΤΠ", name: "Τιμολόγιο Πώλησης", invoiceType: "1.1" },
    ],
    products: [
      { name: "Φάρμακο (μειωμένος ΦΠΑ 6%)", sku: "PHRM-DRUG", unitPrice: 8.5, vatCategory: 3, classificationCategory: "category1_1", classificationType: "E3_561_001", measurementUnit: 1, category: "Φάρμακα" },
      { name: "Παραφαρμακευτικό", sku: "PHRM-OTC", unitPrice: 12, vatCategory: 1, classificationCategory: "category1_1", classificationType: "E3_561_001", measurementUnit: 1, category: "Παραφάρμακα" },
      { name: "Καλλυντικό/Δερμοκαλλυντικό", sku: "PHRM-COS", unitPrice: 22, vatCategory: 1, classificationCategory: "category1_1", classificationType: "E3_561_001", measurementUnit: 1, category: "Καλλυντικά" },
    ],
  },
  realestate: {
    id: "realestate",
    label: "Μεσιτικό γραφείο",
    description: "ΤΠΥ αμοιβής, εκτιμήσεις.",
    series: [
      { code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών", invoiceType: "2.1" },
      { code: "ΑΠΥ", name: "Απόδειξη Παροχής Υπηρεσιών Λιανικής", invoiceType: "11.2" },
    ],
    products: [
      { name: "Αμοιβή διαμεσολάβησης πώλησης (2%)", sku: "RE-COMM-SELL", unitPrice: 2000, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Αμοιβές" },
      { name: "Αμοιβή διαμεσολάβησης μίσθωσης (μηνιαίο μίσθωμα)", sku: "RE-COMM-RENT", unitPrice: 600, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Αμοιβές" },
      { name: "Εκτίμηση ακινήτου", sku: "RE-VAL", unitPrice: 250, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Υπηρεσίες" },
    ],
  },
  transport: {
    id: "transport",
    label: "Μεταφορές / Ταξί",
    description: "ΑΠΥ κόμιστρου, ΤΠΥ εταιρικές μεταφορές.",
    series: [
      { code: "ΑΠΥ", name: "Απόδειξη Παροχής Υπηρεσιών", invoiceType: "11.2" },
      { code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών", invoiceType: "2.1" },
      { code: "ΔΑ", name: "Δελτίο Αποστολής", invoiceType: "9.3" },
    ],
    products: [
      { name: "Κόμιστρο ταξί (διαδρομή)", sku: "TR-FARE", unitPrice: 15, vatCategory: 2, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Μεταφορές" },
      { name: "Μεταφορά χιλιομέτρου (φορτηγό)", sku: "TR-KM", unitPrice: 1.2, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Μεταφορές" },
      { name: "Ημερήσια απασχόληση οχήματος", sku: "TR-DAY", unitPrice: 220, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Μεταφορές" },
    ],
  },
  accountant: {
    id: "accountant",
    label: "Λογιστικό γραφείο",
    description: "ΤΠΥ μηνιαίας τήρησης, Ε1/Ε3/ΦΠΑ.",
    series: [
      { code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών", invoiceType: "2.1" },
      { code: "ΑΠΥ", name: "Απόδειξη Παροχής Υπηρεσιών Λιανικής", invoiceType: "11.2" },
    ],
    products: [
      { name: "Μηνιαία τήρηση απλογραφικών βιβλίων", sku: "ACC-B-MONTH", unitPrice: 80, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Τήρηση" },
      { name: "Μηνιαία τήρηση διπλογραφικών βιβλίων", sku: "ACC-C-MONTH", unitPrice: 250, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Τήρηση" },
      { name: "Ετήσια δήλωση Ε1 ιδιώτη", sku: "ACC-E1", unitPrice: 40, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Δηλώσεις" },
      { name: "Ε3 φυσικού προσώπου (επιχείρηση)", sku: "ACC-E3", unitPrice: 120, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Δηλώσεις" },
      { name: "Περιοδική ΦΠΑ (Φ2)", sku: "ACC-VAT", unitPrice: 25, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Δηλώσεις" },
    ],
  },
  photographer: {
    id: "photographer",
    label: "Φωτογράφος / Videographer",
    description: "Γάμοι, βάπτιση, εταιρική φωτογράφιση.",
    series: [
      { code: "ΑΠΥ", name: "Απόδειξη Παροχής Υπηρεσιών", invoiceType: "11.2" },
      { code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών (εταιρίες)", invoiceType: "2.1" },
    ],
    products: [
      { name: "Πακέτο γάμου Basic", sku: "PHT-WED-B", unitPrice: 900, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Γάμος" },
      { name: "Πακέτο γάμου Premium", sku: "PHT-WED-P", unitPrice: 1800, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Γάμος" },
      { name: "Βάπτιση", sku: "PHT-BAPT", unitPrice: 500, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 1, category: "Εκδηλώσεις" },
      { name: "Εταιρικό φωτορεπορτάζ (ώρα)", sku: "PHT-CORP", unitPrice: 90, vatCategory: 1, classificationCategory: "category1_3", classificationType: "E3_561_001", measurementUnit: 3, category: "Εταιρικά" },
    ],
  },
};
