import { randomUUID } from "node:crypto";
import type { Db } from "./index";
import { eq } from "drizzle-orm";
import { customerActivities, customers, organizations, products, series, users } from "./schema";
import { issueInvoice, recordPayment, saveDraft, transmitToMyData } from "@/lib/services/invoices";
import { hashPassword } from "@/lib/auth/password";
import { addMembership } from "@/lib/auth/session";
import { saveExpense } from "@/lib/services/expenses";
import { saveTemplate } from "@/lib/services/recurring";

export const DEMO_EMAIL = "demo@timologio.gr";
export const DEMO_PASSWORD = "demo1234";

const iso = (d: Date) => d.toISOString();
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};
const daysFromNow = (n: number) => daysAgo(-n);

/**
 * Δημιουργεί έναν επιδεικτικό οργανισμό με πελάτες, είδη και παραστατικά
 * την πρώτη φορά που ξεκινά η εφαρμογή με κενή βάση.
 */
export async function seedIfEmpty(db: Db) {
  const existing = await db.query.organizations.findFirst();
  if (existing) return;

  const orgId = randomUUID();
  const org = {
    id: orgId,
    name: "Δήμος Παπαδόπουλος & ΣΙΑ Ε.Ε.",
    legalName: "Δ. ΠΑΠΑΔΟΠΟΥΛΟΣ & ΣΙΑ Ε.Ε.",
    afm: "800000118",
    doy: "ΦΑΕ Αθηνών",
    activity: "Υπηρεσίες Πληροφορικής & Συμβουλευτικές Υπηρεσίες",
    gemi: "123456789000",
    address: "Λεωφ. Κηφισίας 120",
    city: "Αθήνα",
    postalCode: "11526",
    country: "GR",
    email: "info@papadopoulos-it.gr",
    phone: "210 6900000",
    website: "www.papadopoulos-it.gr",
    iban: "GR16 0110 1250 0000 0001 2300 695",
    bankName: "Εθνική Τράπεζα",
    logoText: "ΠΑΠΑΔΟΠΟΥΛΟΣ IT",
    invoiceFooter: "Ευχαριστούμε για τη συνεργασία. Παρακαλούμε αναγράψτε τον αριθμό παραστατικού στην κατάθεση.",
    defaultPaymentTermsDays: 30,
    mydataUserId: "",
    mydataSubscriptionKey: "",
    mydataEnvironment: "mock",
    plan: "trial",
    planStatus: "trialing",
    trialEndsAt: iso(daysFromNow(14)),
    billingEmail: "info@papadopoulos-it.gr",
    createdAt: iso(new Date()),
  };
  await db.insert(organizations).values(org);

  // Επιδεικτικός χρήστης (ιδιοκτήτης) + λογιστής με πρόσβαση μόνο ανάγνωσης
  const ownerId = randomUUID();
  const accountantId = randomUUID();
  await db.insert(users).values([
    { id: ownerId, email: DEMO_EMAIL, name: "Δήμος Παπαδόπουλος", passwordHash: await hashPassword(DEMO_PASSWORD), emailVerifiedAt: iso(new Date()), lastOrgId: orgId, createdAt: iso(daysAgo(30)) },
    { id: accountantId, email: "logistis@timologio.gr", name: "Άννα Λογιστή", passwordHash: await hashPassword(DEMO_PASSWORD), emailVerifiedAt: iso(new Date()), lastOrgId: orgId, createdAt: iso(daysAgo(20)) },
  ]);
  await addMembership(db, ownerId, orgId, "owner");
  await addMembership(db, accountantId, orgId, "accountant");

  const year = new Date().getFullYear();
  const seriesRows = [
    { id: randomUUID(), orgId, code: "ΤΠ", name: "Τιμολόγιο Πώλησης", invoiceType: "1.1", nextNumber: 1, numberingYear: year, active: true },
    { id: randomUUID(), orgId, code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών", invoiceType: "2.1", nextNumber: 1, numberingYear: year, active: true },
    { id: randomUUID(), orgId, code: "ΤΠΥ-ΕΕ", name: "ΤΠΥ Ενδοκοινοτικό", invoiceType: "2.2", nextNumber: 1, numberingYear: year, active: true },
    { id: randomUUID(), orgId, code: "ΤΠ-ΕΕ", name: "Τιμολόγιο Πώλησης Ενδοκοινοτικό", invoiceType: "1.2", nextNumber: 1, numberingYear: year, active: true },
    { id: randomUUID(), orgId, code: "ΤΠ-3Χ", name: "Τιμολόγιο Πώλησης Τρίτων Χωρών", invoiceType: "1.3", nextNumber: 1, numberingYear: year, active: true },
    { id: randomUUID(), orgId, code: "ΑΠΥ", name: "Απόδειξη Παροχής Υπηρεσιών", invoiceType: "11.2", nextNumber: 1, numberingYear: year, active: true },
    { id: randomUUID(), orgId, code: "ΑΛΠ", name: "Απόδειξη Λιανικής Πώλησης", invoiceType: "11.1", nextNumber: 1, numberingYear: year, active: true },
    { id: randomUUID(), orgId, code: "ΠΤ", name: "Πιστωτικό Τιμολόγιο", invoiceType: "5.1", nextNumber: 1, numberingYear: year, active: true },
    { id: randomUUID(), orgId, code: "ΔΑ", name: "Δελτίο Αποστολής", invoiceType: "9.3", nextNumber: 1, numberingYear: year, active: true },
    { id: randomUUID(), orgId, code: "ΠΡ", name: "Προσφορά", invoiceType: "QUOTE", nextNumber: 1, numberingYear: year, active: true },
  ];
  await db.insert(series).values(seriesRows);
  const bySeries = Object.fromEntries(seriesRows.map((s) => [s.code, s.id]));

  const customerRows = [
    {
      id: randomUUID(),
      orgId,
      kind: "company",
      name: "Αφοί Γεωργίου Α.Ε.",
      afm: "099936189",
      doy: "ΦΑΕ Πειραιά",
      activity: "Εμπόριο Ηλεκτρολογικού Υλικού",
      address: "Ακτή Μιαούλη 45",
      city: "Πειραιάς",
      postalCode: "18535",
      country: "GR",
      email: "logistirio@georgiou.gr",
      phone: "210 4100000",
      contactPerson: "Μαρία Γεωργίου",
      notes: "Πληρώνει πάντα στην ώρα του. Προτιμά επικοινωνία μέσω email.",
      stage: "customer",
      paymentTermsDays: 30,
      createdAt: iso(daysAgo(200)),
    },
    {
      id: randomUUID(),
      orgId,
      kind: "company",
      name: "Nordic Design ApS",
      afm: "DK12345678",
      doy: "",
      activity: "Design Studio",
      address: "Vesterbrogade 12, 1620 København",
      city: "Copenhagen",
      postalCode: "1620",
      country: "DK",
      email: "finance@nordicdesign.dk",
      phone: "+45 33 12 34 56",
      contactPerson: "Lars Nielsen",
      notes: "Ενδοκοινοτικός πελάτης – τιμολόγηση χωρίς ΦΠΑ (άρθρο 14).",
      stage: "customer",
      paymentTermsDays: 15,
      createdAt: iso(daysAgo(120)),
    },
    {
      id: randomUUID(),
      orgId,
      kind: "company",
      name: "Καφέ Μπαρ «Η Πλατεία» – Κ. Νικολάου",
      afm: "123456783",
      doy: "Α' Θεσσαλονίκης",
      activity: "Καφέ - Μπαρ",
      address: "Πλατεία Αριστοτέλους 3",
      city: "Θεσσαλονίκη",
      postalCode: "54624",
      country: "GR",
      email: "kostas@plateia.gr",
      phone: "2310 555000",
      contactPerson: "Κώστας Νικολάου",
      notes: "",
      stage: "customer",
      paymentTermsDays: 0,
      createdAt: iso(daysAgo(60)),
    },
    {
      id: randomUUID(),
      orgId,
      kind: "individual",
      name: "Ελένη Αντωνίου",
      afm: "",
      doy: "",
      activity: "",
      address: "Σόλωνος 88",
      city: "Αθήνα",
      postalCode: "10680",
      country: "GR",
      email: "eleni.antoniou@example.com",
      phone: "6970000000",
      contactPerson: "",
      notes: "Ιδιώτης – αποδείξεις λιανικής.",
      stage: "customer",
      paymentTermsDays: 0,
      createdAt: iso(daysAgo(30)),
    },
    {
      id: randomUUID(),
      orgId,
      kind: "company",
      name: "Logistics Hellas Μ.ΙΚΕ",
      afm: "800123456",
      doy: "Ελευσίνας",
      activity: "Μεταφορές & Logistics",
      address: "ΒΙΠΕ Μαγούλας, Ο.Τ. 12",
      city: "Μαγούλα",
      postalCode: "19018",
      country: "GR",
      email: "it@logisticshellas.gr",
      phone: "210 5500000",
      contactPerson: "Γιάννης Σταύρου",
      notes: "Ζήτησαν προσφορά για ERP integration. Follow-up σε 1 εβδομάδα.",
      stage: "prospect",
      paymentTermsDays: 45,
      createdAt: iso(daysAgo(10)),
    },
    {
      id: randomUUID(),
      orgId,
      kind: "company",
      name: "Φαρμακείο Δημητρίου",
      afm: "",
      doy: "",
      activity: "Φαρμακείο",
      address: "",
      city: "Πάτρα",
      postalCode: "",
      country: "GR",
      email: "",
      phone: "2610 300000",
      contactPerson: "Νίκος Δημητρίου",
      notes: "Γνωριμία σε έκθεση. Δεν έχουμε ακόμη ΑΦΜ.",
      stage: "lead",
      paymentTermsDays: null,
      createdAt: iso(daysAgo(3)),
    },
  ];
  await db.insert(customers).values(customerRows);
  const [georgiou, nordic, plateia, eleni, logistics, pharmacy] = customerRows;

  await db.insert(customerActivities).values([
    {
      id: randomUUID(),
      orgId,
      customerId: logistics.id,
      kind: "meeting",
      content: "Παρουσίαση λύσης ERP στα γραφεία τους. Ενδιαφέρον για σύνδεση με WMS.",
      dueAt: null,
      done: true,
      createdAt: iso(daysAgo(7)),
    },
    {
      id: randomUUID(),
      orgId,
      customerId: logistics.id,
      kind: "task",
      content: "Αποστολή οικονομικής προσφοράς για ERP integration (3 φάσεις).",
      dueAt: iso(daysFromNow(3)),
      done: false,
      createdAt: iso(daysAgo(2)),
    },
    {
      id: randomUUID(),
      orgId,
      customerId: pharmacy.id,
      kind: "call",
      content: "Τηλεφωνική επικοινωνία – θέλει demo για σύστημα τιμολόγησης λιανικής.",
      dueAt: null,
      done: true,
      createdAt: iso(daysAgo(3)),
    },
    {
      id: randomUUID(),
      orgId,
      customerId: pharmacy.id,
      kind: "task",
      content: "Προγραμματισμός online demo.",
      dueAt: iso(daysFromNow(1)),
      done: false,
      createdAt: iso(daysAgo(3)),
    },
    {
      id: randomUUID(),
      orgId,
      customerId: georgiou.id,
      kind: "note",
      content: "Ανανέωση ετήσιου συμβολαίου συντήρησης – συμφωνήθηκε αύξηση 5%.",
      dueAt: null,
      done: true,
      createdAt: iso(daysAgo(20)),
    },
  ]);

  const productRows = [
    {
      id: randomUUID(),
      orgId,
      sku: "SRV-CONS",
      name: "Συμβουλευτικές υπηρεσίες IT (ώρα)",
      description: "Ωριαία χρέωση συμβουλευτικών υπηρεσιών πληροφορικής.",
      kind: "service",
      unitPrice: 65,
      costPrice: 0,
      vatCategory: 1,
      vatExemptionCategory: null,
      measurementUnit: 7,
      classificationCategory: "category1_3",
      classificationType: "E3_561_001",
      trackStock: false,
      stockQuantity: 0,
      reorderLevel: 0,
      active: true,
      createdAt: iso(daysAgo(300)),
    },
    {
      id: randomUUID(),
      orgId,
      sku: "SRV-SUPPORT-M",
      name: "Συμβόλαιο συντήρησης (μήνας)",
      description: "Μηνιαία συντήρηση & υποστήριξη συστημάτων, SLA 8x5.",
      kind: "service",
      unitPrice: 350,
      costPrice: 0,
      vatCategory: 1,
      vatExemptionCategory: null,
      measurementUnit: 7,
      classificationCategory: "category1_3",
      classificationType: "E3_561_001",
      trackStock: false,
      stockQuantity: 0,
      reorderLevel: 0,
      active: true,
      createdAt: iso(daysAgo(300)),
    },
    {
      id: randomUUID(),
      orgId,
      sku: "SRV-WEBDEV",
      name: "Ανάπτυξη ιστοσελίδας / e-shop",
      description: "Σχεδίαση και ανάπτυξη ιστοσελίδας κατά παραγγελία.",
      kind: "service",
      unitPrice: 1800,
      costPrice: 0,
      vatCategory: 1,
      vatExemptionCategory: null,
      measurementUnit: 7,
      classificationCategory: "category1_3",
      classificationType: "E3_561_001",
      trackStock: false,
      stockQuantity: 0,
      reorderLevel: 0,
      active: true,
      createdAt: iso(daysAgo(300)),
    },
    {
      id: randomUUID(),
      orgId,
      sku: "HW-LAPTOP-14",
      name: "Laptop 14'' Business (i7/16GB/512GB)",
      description: "Φορητός υπολογιστής επαγγελματικής σειράς, 3 έτη εγγύηση.",
      kind: "product",
      unitPrice: 1150,
      costPrice: 890,
      vatCategory: 1,
      vatExemptionCategory: null,
      measurementUnit: 1,
      classificationCategory: "category1_1",
      classificationType: "E3_561_001",
      trackStock: true,
      stockQuantity: 12,
      reorderLevel: 4,
      active: true,
      createdAt: iso(daysAgo(200)),
    },
    {
      id: randomUUID(),
      orgId,
      sku: "HW-ROUTER-AX",
      name: "Router Wi-Fi 6 AX3000",
      description: "Δρομολογητής διπλής ζώνης Wi-Fi 6.",
      kind: "product",
      unitPrice: 129,
      costPrice: 84,
      vatCategory: 1,
      vatExemptionCategory: null,
      measurementUnit: 1,
      classificationCategory: "category1_1",
      classificationType: "E3_561_001",
      trackStock: true,
      stockQuantity: 3,
      reorderLevel: 5,
      active: true,
      createdAt: iso(daysAgo(200)),
    },
    {
      id: randomUUID(),
      orgId,
      sku: "BK-MANUAL",
      name: "Εγχειρίδιο χρήσης (έντυπο)",
      description: "Βιβλίο – μειωμένος συντελεστής ΦΠΑ 6%.",
      kind: "product",
      unitPrice: 18,
      costPrice: 7,
      vatCategory: 3,
      vatExemptionCategory: null,
      measurementUnit: 1,
      classificationCategory: "category1_1",
      classificationType: "E3_561_003",
      trackStock: true,
      stockQuantity: 40,
      reorderLevel: 10,
      active: true,
      createdAt: iso(daysAgo(200)),
    },
  ];
  await db.insert(products).values(productRows);
  const [cons, support, webdev, laptop, router, manual] = productRows;

  const orgRow = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!orgRow) throw new Error("Seed: ο οργανισμός επίδειξης δεν βρέθηκε μετά την εισαγωγή.");
  const lineFrom = (p: (typeof productRows)[number], quantity: number, extra: Partial<Parameters<typeof saveDraft>[2]["lines"][number]> = {}) => ({
    productId: p.id,
    description: p.name,
    quantity,
    unitPrice: p.unitPrice,
    discountPercent: 0,
    vatCategory: p.vatCategory,
    vatExemptionCategory: p.vatExemptionCategory,
    measurementUnit: p.measurementUnit,
    classificationCategory: p.classificationCategory,
    classificationType: p.classificationType,
    withholdingCategory: 0,
    stampDutyCategory: 0,
    ...extra,
  });

  // 1. ΤΠΥ – Αφοί Γεωργίου, εξοφλημένο, διαβιβασμένο
  const inv1 = await saveDraft(db, orgRow, {
    customerId: georgiou.id,
    seriesId: bySeries["ΤΠΥ"],
    issueDate: dateOnly(daysAgo(40)),
    dueDate: dateOnly(daysAgo(10)),
    currency: "EUR",
    paymentMethod: 6,
    notes: "Συμβόλαιο συντήρησης – προηγούμενος μήνας.",
    correlatedInvoiceId: null,
    lines: [lineFrom(support, 1), lineFrom(cons, 6)],
  });
  await issueInvoice(db, orgRow, inv1);
  await transmitToMyData(db, orgRow, inv1);
  {
    const inv = (await db.query.invoices.findFirst({ where: (t, { eq }) => eq(t.id, inv1) }))!;
    await recordPayment(db, orgRow, { invoiceId: inv1, amount: inv.totalGrossValue, paidAt: dateOnly(daysAgo(12)), method: 6, reference: "Web banking #A1234" });
  }

  // 2. ΤΠ – Laptop + router σε Αφοί Γεωργίου, εκδομένο, διαβιβασμένο, ανεξόφλητο
  const inv2 = await saveDraft(db, orgRow, {
    customerId: georgiou.id,
    seriesId: bySeries["ΤΠ"],
    issueDate: dateOnly(daysAgo(12)),
    dueDate: dateOnly(daysFromNow(18)),
    currency: "EUR",
    paymentMethod: 5,
    notes: "Παράδοση στα γραφεία Πειραιά.",
    correlatedInvoiceId: null,
    lines: [lineFrom(laptop, 2, { discountPercent: 5 }), lineFrom(router, 2), lineFrom(manual, 2)],
  });
  await issueInvoice(db, orgRow, inv2);
  await transmitToMyData(db, orgRow, inv2);

  // 3. ΤΠΥ – Ενδοκοινοτικό σε Nordic Design, ΦΠΑ 0% άρθρο 14, διαβιβασμένο, εκπρόθεσμο
  const inv3 = await saveDraft(db, orgRow, {
    customerId: nordic.id,
    seriesId: bySeries["ΤΠΥ-ΕΕ"],
    issueDate: dateOnly(daysAgo(35)),
    dueDate: dateOnly(daysAgo(5)),
    currency: "EUR",
    paymentMethod: 2,
    notes: "Reverse charge – VAT exempt, art. 14 Greek VAT Code (EU Directive 2006/112/EC art. 44).",
    correlatedInvoiceId: null,
    lines: [
      lineFrom(webdev, 1, { vatCategory: 7, vatExemptionCategory: 4, classificationType: "E3_561_005" }),
      lineFrom(cons, 10, { vatCategory: 7, vatExemptionCategory: 4, classificationType: "E3_561_005" }),
    ],
  });
  await issueInvoice(db, orgRow, inv3);
  await transmitToMyData(db, orgRow, inv3);

  // 4. ΤΠΥ – Καφέ Πλατεία με παρακράτηση 20% (αμοιβές συμβουλών), εκδομένο, ΜΗ διαβιβασμένο
  const inv4 = await saveDraft(db, orgRow, {
    customerId: plateia.id,
    seriesId: bySeries["ΤΠΥ"],
    issueDate: dateOnly(daysAgo(2)),
    dueDate: dateOnly(daysFromNow(28)),
    currency: "EUR",
    paymentMethod: 1,
    notes: "Εγκατάσταση ταμειακού συστήματος & εκπαίδευση προσωπικού.",
    correlatedInvoiceId: null,
    lines: [lineFrom(cons, 8, { withholdingCategory: 3 })],
  });
  await issueInvoice(db, orgRow, inv4);

  // 5. ΑΠΥ – Ελένη Αντωνίου, λιανική, εξοφλημένη με POS, διαβιβασμένη
  const inv5 = await saveDraft(db, orgRow, {
    customerId: eleni.id,
    seriesId: bySeries["ΑΠΥ"],
    issueDate: dateOnly(daysAgo(5)),
    dueDate: dateOnly(daysAgo(5)),
    currency: "EUR",
    paymentMethod: 7,
    notes: "",
    correlatedInvoiceId: null,
    lines: [lineFrom(cons, 2)],
  });
  await issueInvoice(db, orgRow, inv5);
  await transmitToMyData(db, orgRow, inv5);
  {
    const inv = (await db.query.invoices.findFirst({ where: (t, { eq }) => eq(t.id, inv5) }))!;
    await recordPayment(db, orgRow, { invoiceId: inv5, amount: inv.totalGrossValue, paidAt: dateOnly(daysAgo(5)), method: 7, reference: "POS" });
  }

  // 6. Πρόχειρο ΤΠ για Logistics Hellas
  await saveDraft(db, orgRow, {
    customerId: logistics.id,
    seriesId: bySeries["ΤΠ"],
    issueDate: dateOnly(new Date()),
    dueDate: dateOnly(daysFromNow(45)),
    currency: "EUR",
    paymentMethod: 5,
    notes: "Προσφορά – φάση 1.",
    correlatedInvoiceId: null,
    lines: [lineFrom(laptop, 5), lineFrom(cons, 20)],
  });

  // 7. Προσφορά (ΠΡ) προς Logistics Hellas – εκδομένη, σε αναμονή απόφασης πελάτη
  const quote = await saveDraft(db, orgRow, {
    customerId: logistics.id,
    seriesId: bySeries["ΠΡ"],
    issueDate: dateOnly(daysAgo(4)),
    dueDate: dateOnly(daysFromNow(26)),
    currency: "EUR",
    paymentMethod: 5,
    notes: "Ισχύς προσφοράς 30 ημέρες. Περιλαμβάνει εγκατάσταση και εκπαίδευση 2 ημερών.",
    correlatedInvoiceId: null,
    lines: [lineFrom(webdev, 1, { description: "ERP integration – Φάση 1 (ανάλυση & σχεδίαση)" }), lineFrom(cons, 40), lineFrom(laptop, 5, { discountPercent: 8 })],
  });
  await issueInvoice(db, orgRow, quote);

  // 8. Δελτίο Αποστολής (9.3) προς Αφοί Γεωργίου – διαβιβασμένο
  const dn = await saveDraft(db, orgRow, {
    customerId: georgiou.id,
    seriesId: bySeries["ΔΑ"],
    issueDate: dateOnly(daysAgo(12)),
    dueDate: null,
    currency: "EUR",
    paymentMethod: 5,
    notes: "Συνοδεύει το ΤΠ – παράδοση με εταιρικό όχημα.",
    correlatedInvoiceId: null,
    dispatchDate: dateOnly(daysAgo(12)),
    vehicleNumber: "ΙΚΧ-1234",
    movePurpose: 1,
    loadingAddress: "Λεωφ. Κηφισίας 120, 11526 Αθήνα",
    deliveryAddress: "Ακτή Μιαούλη 45, 18535 Πειραιάς",
    lines: [lineFrom(laptop, 2), lineFrom(router, 2), lineFrom(manual, 2)],
  });
  await issueInvoice(db, orgRow, dn);
  await transmitToMyData(db, orgRow, dn);

  // 9. Επαναλαμβανόμενο πρότυπο – μηνιαίο συμβόλαιο συντήρησης
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
  await saveTemplate(db, orgId, {
    name: "Συμβόλαιο συντήρησης – Αφοί Γεωργίου",
    customerId: georgiou.id,
    seriesId: bySeries["ΤΠΥ"],
    paymentMethod: 6,
    notes: "Μηνιαία συντήρηση & υποστήριξη συστημάτων.",
    interval: "monthly",
    nextRunAt: dateOnly(nextMonth),
    autoIssue: true,
    autoTransmit: false,
    autoEmail: false,
    lines: [lineFrom(support, 1)],
  });

  // 10. Έξοδα προμηθευτών (χειροκίνητα) – για ΦΠΑ εισροών
  await saveExpense(db, orgId, {
    supplierName: "COSMOTE Α.Ε.",
    supplierAfm: "094493766",
    supplierCountry: "GR",
    invoiceType: "2.1",
    series: "Α",
    number: "88213456",
    issueDate: dateOnly(daysAgo(15)),
    description: "Τηλεφωνία & internet γραφείου",
    netValue: 89.5,
    vatCategory: 1,
    vatAmount: 21.48,
    withheldAmount: 0,
    classificationCategory: "category2_4",
    classificationType: "E3_585_012",
    vatDeductible: true,
  });
  await saveExpense(db, orgId, {
    supplierName: "ΔΕΗ Α.Ε.",
    supplierAfm: "090000045",
    supplierCountry: "GR",
    invoiceType: "1.1",
    series: "",
    number: "1204558811",
    issueDate: dateOnly(daysAgo(8)),
    description: "Ηλεκτρικό ρεύμα γραφείου",
    netValue: 142.3,
    vatCategory: 3,
    vatAmount: 8.54,
    withheldAmount: 0,
    classificationCategory: "category2_4",
    classificationType: "E3_585_010",
    vatDeductible: true,
  });
  await saveExpense(db, orgId, {
    supplierName: "Ξενοδοχείο Ακρόπολις",
    supplierAfm: "998877665",
    supplierCountry: "GR",
    invoiceType: "2.1",
    series: "Β",
    number: "4471",
    issueDate: dateOnly(daysAgo(3)),
    description: "Διαμονή σε επαγγελματικό ταξίδι Θεσσαλονίκη",
    netValue: 180,
    vatCategory: 2,
    vatAmount: 23.4,
    withheldAmount: 0,
    classificationCategory: "category2_5",
    classificationType: "E3_585_016",
    vatDeductible: false,
  });
}
