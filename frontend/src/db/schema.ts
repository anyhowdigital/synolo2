import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Πολυ-εταιρικό (multi-tenant) σχήμα: κάθε εγγραφή ανήκει σε έναν οργανισμό (συνδρομητή).
 */
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  afm: text("afm").notNull().default(""),
  doy: text("doy").default(""),
  activity: text("activity").default(""),
  gemi: text("gemi").default(""),
  address: text("address").default(""),
  city: text("city").default(""),
  postalCode: text("postal_code").default(""),
  country: text("country").notNull().default("GR"),
  email: text("email").default(""),
  phone: text("phone").default(""),
  website: text("website").default(""),
  iban: text("iban").default(""),
  bankName: text("bank_name").default(""),
  logoText: text("logo_text").default(""),
  logoDataUrl: text("logo_data_url"),
  invoiceFooter: text("invoice_footer").default(""),
  /** Θέμα εμφάνισης PDF/εκτύπωσης (JSON – βλ. lib/pdf/theme.ts). */
  pdfThemeJson: text("pdf_theme_json").notNull().default("{}"),
  defaultPaymentTermsDays: integer("default_payment_terms_days").notNull().default(30),
  autoTransmit: integer("auto_transmit", { mode: "boolean" }).notNull().default(false),
  yearlyNumbering: integer("yearly_numbering", { mode: "boolean" }).notNull().default(false),
  /** Στάδια αυτόματων υπενθυμίσεων σε ημέρες ως προς την προθεσμία (αρνητικά = πριν τη λήξη). */
  reminderDays: text("reminder_days").notNull().default("-3,0,7,21"),
  /** Ετήσιο επιτόκιο υπερημερίας % (0 = απενεργοποιημένο). */
  lateInterestAnnualRate: real("late_interest_annual_rate").notNull().default(0),
  /** Πάγια χρέωση καθυστέρησης € ανά παραστατικό (0 = καμία). */
  lateFeeFlat: real("late_fee_flat").notNull().default(0),
  /** 6ψήφιος κωδικός σύνδεσης λογιστικού γραφείου (άμεση σύνδεση χωρίς έγκριση). */
  accountantLinkCode: text("accountant_link_code").notNull().default(""),
  accountantLinkCodeExpires: text("accountant_link_code_expires"),
  /** Επιτρέπει στην ίδια την επιχείρηση να διαχειρίζεται τα ευαίσθητα λογιστικά (διπλογραφικά, μισθοδοσία). Default: μόνο ο λογιστής. */
  booksSelfManage: integer("books_self_manage", { mode: "boolean" }).notNull().default(false),
  /** Λογιστικό σχέδιο: "" (χωρίς), elp ή egls. */
  accountingPlan: text("accounting_plan").notNull().default(""),
  /** simple (απλογραφικά) | double (διπλογραφικά) */
  booksCategory: text("books_category").notNull().default("simple"),
  // myDATA
  mydataUserId: text("mydata_user_id").default(""),
  mydataSubscriptionKey: text("mydata_subscription_key").default(""),
  mydataEnvironment: text("mydata_environment").notNull().default("mock"), // mock | dev | prod
  /** Διαπιστευτήρια ΑΑΔΕ «Αναζήτηση Βασικών Στοιχείων Μητρώου» (RgWsPublicService). */
  aadeRgUsername: text("aade_rg_username").notNull().default(""),
  aadeRgPassword: text("aade_rg_password").notNull().default(""),
  // Συνδρομή SaaS
  plan: text("plan").notNull().default("trial"), // trial | starter | pro | business
  planStatus: text("plan_status").notNull().default("trialing"), // trialing | active | past_due | cancelled
  planInterval: text("plan_interval").default("monthly"),
  trialEndsAt: text("trial_ends_at"),
  currentPeriodEnd: text("current_period_end"),
  billingEmail: text("billing_email").default(""),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Stripe Connect λογαριασμός (acct_…) στον οποίο καταλήγουν οι online πληρωμές τιμολογίων του συνδρομητή. */
  stripeAccountId: text("stripe_account_id"),
  /** Λογιστική γέφυρα ΕΛΠ: JSON με κωδικούς λογαριασμών (πωλήσεις ανά ΦΠΑ, ΦΠΑ, πελάτες, έξοδα). */
  accountingMapJson: text("accounting_map_json"),
  /** Πληρωμή τιμολογίων online από τη δημόσια σελίδα. */
  onlinePayments: integer("online_payments", { mode: "boolean" }).notNull().default(true),
  /** Δίγλωσσο παραστατικό (EN) για πελάτες εξωτερικού. */
  bilingualInvoices: integer("bilingual_invoices", { mode: "boolean" }).notNull().default(true),
  /** Ορισμοί custom πεδίων ανά οντότητα (JSON array από CustomFieldDef). */
  customFieldDefsJson: text("custom_field_defs_json").notNull().default("[]"),
  /** Κανάλια πώλησης (comma-separated) για τις αναφορές ανά κανάλι. */
  salesChannels: text("sales_channels").notNull().default(""),
  /** Φορολογικό προφίλ επιχείρησης (JSON – βλ. lib/tax/engine.ts TaxProfile) για τον Σύμβουλο βελτιστοποίησης. */
  taxProfileJson: text("tax_profile_json").notNull().default("{}"),
  accountingBridgeJson: text("accounting_bridge_json").notNull().default("{}"),
  /** Overrides ανά οργανισμό (feature flags & όρια) από το super-admin panel. JSON. */
  overridesJson: text("overrides_json").notNull().default("{}"),
  // Τιμολόγηση Δημοσίου (B2G / PEPPOL) μέσω πιστοποιημένου παρόχου
  b2gEnabled: integer("b2g_enabled", { mode: "boolean" }).notNull().default(false),
  b2gProvider: text("b2g_provider").notNull().default("simulation"),
  b2gEnvironment: text("b2g_environment").notNull().default("test"), // test | prod
  b2gBaseUrl: text("b2g_base_url").notNull().default(""),
  b2gApiKey: text("b2g_api_key").notNull().default(""),
  b2gApiSecret: text("b2g_api_secret").notNull().default(""),
  b2gUsername: text("b2g_username").notNull().default(""),
  b2gSubscriptionKey: text("b2g_subscription_key").notNull().default(""),
  /** Αυτόματη αποστολή στο Δημόσιο μόλις εκδοθεί παραστατικό φορέα. */
  b2gAutoSend: integer("b2g_auto_send", { mode: "boolean" }).notNull().default(false),
  /** Επωνυμία πιστοποιημένου παρόχου ηλεκτρονικής τιμολόγησης (αναγράφεται στο παραστατικό). */
  eInvoiceProviderName: text("einvoice_provider_name").notNull().default(""),
  /** ΑΦΜ παρόχου ηλεκτρονικής τιμολόγησης. */
  eInvoiceProviderAfm: text("einvoice_provider_afm").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: text("email_verified_at"),
  lastOrgId: text("last_org_id"),
  totpSecret: text("totp_secret"),
  totpEnabledAt: text("totp_enabled_at"),
  createdAt: text("created_at").notNull(),
});

export const emailVerifications = sqliteTable("email_verifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

/** Προσωρινή σύνδεση που περιμένει κωδικό 2FA. */
export const pendingLogins = sqliteTable("pending_logins", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});

/** Αποτυχημένες προσπάθειες σύνδεσης ανά email (προστασία brute force, κοινή σε όλα τα instances). */
export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  lastFailedAt: text("last_failed_at").notNull(),
  lockedUntil: text("locked_until"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  userAgent: text("user_agent").default(""),
  ipAddress: text("ip_address").default(""),
  lastSeenAt: text("last_seen_at"),
  createdAt: text("created_at").notNull(),
});

/** Ρόλοι: owner (πλήρης + χρέωση), admin, member (έκδοση), accountant (ανάγνωση + εξαγωγές). */
export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  orgId: text("org_id").notNull(),
  role: text("role").notNull().default("member"),
  /** Προτιμήσεις ειδοποιήσεων (JSON: { [type]: { inApp: boolean; email: boolean } }). */
  notificationPrefsJson: text("notification_prefs_json").notNull().default("{}"),
  /** Προτιμήσεις εμφάνισης πλαισίων αρχικής σελίδας ({hidden:[],order:[]}). */
  dashboardPrefsJson: text("dashboard_prefs_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
});

/** Ειδοποιήσεις ροής προς χρήστες (userId null = όλοι οι χρήστες του οργανισμού). */
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id"),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link"),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("notifications_org_user_idx").on(t.orgId, t.userId, t.readAt)],
);

/** Προβολές παραστατικών από τον πελάτη (email pixel, δημόσιος σύνδεσμος, portal). */
export const documentViews = sqliteTable(
  "document_views",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    invoiceId: text("invoice_id").notNull(),
    source: text("source").notNull().default("link"), // email | link | portal
    ipAddress: text("ip_address").default(""),
    userAgent: text("user_agent").default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("document_views_invoice_idx").on(t.invoiceId)],
);

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  token: text("token").notNull().unique(),
  invitedBy: text("invited_by").notNull(),
  acceptedAt: text("accepted_at"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const passwordResets = sqliteTable("password_resets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  lastUsedAt: text("last_used_at"),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
});

export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").notNull().default("*"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastStatus: text("last_status"),
  lastDeliveredAt: text("last_delivered_at"),
  createdAt: text("created_at").notNull(),
});

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  webhookId: text("webhook_id").notNull(),
  event: text("event").notNull(),
  payload: text("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | delivered | failed
  lastStatusCode: integer("last_status_code"),
  lastError: text("last_error"),
  nextAttemptAt: text("next_attempt_at").notNull(),
  deliveredAt: text("delivered_at"),
  createdAt: text("created_at").notNull(),
});

export const fxRates = sqliteTable("fx_rates", {
  id: text("id").primaryKey(), // `${date}:${currency}`
  date: text("date").notNull(),
  currency: text("currency").notNull(),
  /** 1 μονάδα νομίσματος = rate EUR */
  rateToEur: real("rate_to_eur").notNull(),
  fetchedAt: text("fetched_at").notNull(),
});

export const emailOutbox = sqliteTable("email_outbox", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  attachments: text("attachments").default("[]"),
  status: text("status").notNull().default("queued"), // queued | sent | failed | logged | bounced | complained | delivered | opened
  error: text("error"),
  relatedEntity: text("related_entity"),
  relatedId: text("related_id"),
  sentAt: text("sent_at"),
  providerId: text("provider_id").notNull().default(""),
  providerEvents: text("provider_events").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

export const recurringTemplates = sqliteTable("recurring_templates", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  customerId: text("customer_id").notNull(),
  seriesId: text("series_id").notNull(),
  paymentMethod: integer("payment_method").notNull().default(1),
  notes: text("notes").default(""),
  linesJson: text("lines_json").notNull(),
  interval: text("interval").notNull().default("monthly"), // weekly | monthly | quarterly | yearly
  nextRunAt: text("next_run_at").notNull(),
  autoIssue: integer("auto_issue", { mode: "boolean" }).notNull().default(true),
  autoTransmit: integer("auto_transmit", { mode: "boolean" }).notNull().default(false),
  autoEmail: integer("auto_email", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  /** Αυτόματη χρέωση της αποθηκευμένης κάρτας του πελάτη μόλις εκδοθεί το παραστατικό. */
  autoCharge: integer("auto_charge", { mode: "boolean" }).notNull().default(false),
  chargeFailCount: integer("charge_fail_count").notNull().default(0),
  chargeLastError: text("charge_last_error"),
  chargeLastAt: text("charge_last_at"),
  /** Έναρξη τρέχουσας περιόδου – χρησιμοποιείται στον αναλογικό υπολογισμό (proration). */
  periodStart: text("period_start"),
  lastRunAt: text("last_run_at"),
  runCount: integer("run_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

/** Παραστατικά εξόδων (προμηθευτών) – χειροκίνητα ή από myDATA RequestDocs. */
export const expenses = sqliteTable("expenses", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  supplierName: text("supplier_name").notNull().default(""),
  supplierAfm: text("supplier_afm").notNull().default(""),
  supplierCountry: text("supplier_country").notNull().default("GR"),
  mark: text("mark"),
  uid: text("uid"),
  invoiceType: text("invoice_type").notNull().default("1.1"),
  series: text("series").default(""),
  number: text("number").default(""),
  issueDate: text("issue_date").notNull(),
  description: text("description").default(""),
  netValue: real("net_value").notNull().default(0),
  vatAmount: real("vat_amount").notNull().default(0),
  vatCategory: integer("vat_category").notNull().default(1),
  withheldAmount: real("withheld_amount").notNull().default(0),
  grossValue: real("gross_value").notNull().default(0),
  classificationCategory: text("classification_category").default(""),
  classificationType: text("classification_type").default(""),
  vatDeductible: integer("vat_deductible", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("pending"), // pending | classified | paid | rejected
  source: text("source").notNull().default("manual"), // manual | mydata
  classificationSentAt: text("classification_sent_at"),
  paidAt: text("paid_at"),
  rawXml: text("raw_xml"),
  tags: text("tags").notNull().default("[]"),
  customFieldsJson: text("custom_fields_json").notNull().default("{}"),
  /** Σύνδεση με καρτέλα προμηθευτή (προαιρετική – τα παραστατικά myDATA συνδέονται αυτόματα με βάση το ΑΦΜ). */
  supplierId: text("supplier_id"),
  /** Προθεσμία πληρωμής (για aging πληρωτέων). */
  dueDate: text("due_date"),
  /** Σύνολο καταχωρημένων πληρωμών προς τον προμηθευτή. */
  paidAmount: real("paid_amount").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

/** Καρτέλα προμηθευτή – αντίστοιχο του πελατολογίου για τις αγορές. */
export const suppliers = sqliteTable("suppliers", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  afm: text("afm").notNull().default(""),
  doy: text("doy").notNull().default(""),
  country: text("country").notNull().default("GR"),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  contactPerson: text("contact_person").notNull().default(""),
  iban: text("iban").notNull().default(""),
  bankName: text("bank_name").notNull().default(""),
  /** Ημέρες πίστωσης – προεπιλογή προθεσμίας στα τιμολόγια αγορών. */
  paymentTermsDays: integer("payment_terms_days"),
  /** Προεπιλεγμένος χαρακτηρισμός εξόδου για τα παραστατικά του προμηθευτή. */
  defaultClassificationCategory: text("default_classification_category").notNull().default(""),
  defaultClassificationType: text("default_classification_type").notNull().default(""),
  notes: text("notes").notNull().default(""),
  tags: text("tags").notNull().default("[]"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

/** Αναλυτικές γραμμές τιμολογίου αγοράς (προαιρετικές – τα σύνολα του εξόδου παράγονται από αυτές όταν υπάρχουν). */
export const expenseLines = sqliteTable("expense_lines", {
  id: text("id").primaryKey(),
  expenseId: text("expense_id").notNull(),
  lineNumber: integer("line_number").notNull(),
  description: text("description").notNull(),
  quantity: real("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull().default(0),
  vatCategory: integer("vat_category").notNull().default(1),
  netValue: real("net_value").notNull().default(0),
  vatAmount: real("vat_amount").notNull().default(0),
  /** Σύνδεση με είδος αποθήκης (για ενημέρωση αποθέματος από αγορές). */
  productId: text("product_id"),
});

/** Πληρωμές προς προμηθευτές (μερικές/ολικές) ανά τιμολόγιο αγοράς. */
export const expensePayments = sqliteTable("expense_payments", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  expenseId: text("expense_id").notNull(),
  amount: real("amount").notNull(),
  paidAt: text("paid_at").notNull(),
  method: integer("method").notNull().default(1),
  reference: text("reference").notNull().default(""),
  accountId: text("account_id"),
  createdAt: text("created_at").notNull(),
});

export type Supplier = typeof suppliers.$inferSelect;
export type ExpenseLine = typeof expenseLines.$inferSelect;
export type ExpensePayment = typeof expensePayments.$inferSelect;

export const series = sqliteTable("series", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  invoiceType: text("invoice_type").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  numberingYear: integer("numbering_year"),
  /** Αριθμός εγκατάστασης (υποκατάστημα) ΑΑΔΕ – 0 = έδρα. */
  branch: integer("branch").notNull().default(0),
  branchName: text("branch_name").default(""),
  /** Όροι/σημειώσεις που εκτυπώνονται σε κάθε παραστατικό της σειράς (υπερισχύουν των γενικών όρων). */
  termsText: text("terms_text").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  kind: text("kind").notNull().default("company"), // company | individual
  name: text("name").notNull(),
  afm: text("afm").default(""),
  doy: text("doy").default(""),
  activity: text("activity").default(""),
  address: text("address").default(""),
  city: text("city").default(""),
  postalCode: text("postal_code").default(""),
  country: text("country").notNull().default("GR"),
  email: text("email").default(""),
  phone: text("phone").default(""),
  contactPerson: text("contact_person").default(""),
  notes: text("notes").default(""),
  stage: text("stage").notNull().default("customer"), // lead | prospect | customer | inactive
  paymentTermsDays: integer("payment_terms_days"),
  tags: text("tags").notNull().default("[]"),
  customFieldsJson: text("custom_fields_json").notNull().default("{}"),
  /** Γλώσσα παραστατικών/επικοινωνίας του πελάτη (el | en | de | it). */
  language: text("language").notNull().default("el"),
  /** Υπεύθυνος πωλητής (user id). */
  salespersonId: text("salesperson_id"),
  /** Token πρόσβασης στο client portal (magic link). */
  portalToken: text("portal_token"),
  portalLastSeenAt: text("portal_last_seen_at"),
  /** Τιμοκατάλογος πελάτη (A15) – null = προεπιλεγμένος τιμοκατάλογος / τιμές ειδών. */
  priceListId: text("price_list_id"),
  /** Πάγια έκπτωση πελάτη % (εφαρμόζεται όταν δεν υπάρχει ειδική τιμή/έκπτωση κλιμακίου). */
  discountPercent: real("discount_percent").notNull().default(0),
  // Φορέας Δημοσίου (B2G / PEPPOL)
  publicEntity: integer("public_entity", { mode: "boolean" }).notNull().default(false),
  /** PEPPOL endpoint λήπτη – για ελληνικό Δημόσιο 9933:997001671. */
  b2gEndpointId: text("b2g_endpoint_id").notNull().default(""),
  /** BT-10 BuyerReference (κωδικός δρομολόγησης που δίνει ο φορέας). */
  b2gBuyerReference: text("b2g_buyer_reference").notNull().default(""),
  /** BT-46 Αναγνωριστικό λήπτη (π.χ. κωδικός φορέα/ΚΗΜΔΗΣ). */
  b2gBuyerIdentifier: text("b2g_buyer_identifier").notNull().default(""),
  /** BT-12 ΑΔΑΜ / αριθμός σύμβασης. */
  b2gContractAdam: text("b2g_contract_adam").notNull().default(""),
  /** BT-11 Αναφορά έργου/προϋπολογισμού σε μορφή «1|ΑΔΑ», «2|…», «3|…». */
  b2gProjectReference: text("b2g_project_reference").notNull().default(""),
  /** BT-13 Αριθμός παραγγελίας/εντολής. */
  b2gOrderReference: text("b2g_order_reference").notNull().default(""),
  b2gCpv: text("b2g_cpv").notNull().default(""),
  /** ΚΑΕ / κωδικός προϋπολογισμού φορέα. */
  b2gKae: text("b2g_kae").notNull().default(""),
  // Αποθηκευμένη κάρτα για αυτόματες χρεώσεις συνδρομών (Stripe)
  stripeCustomerId: text("stripe_customer_id"),
  stripePaymentMethodId: text("stripe_payment_method_id"),
  cardBrand: text("card_brand").notNull().default(""),
  cardLast4: text("card_last4").notNull().default(""),
  cardSavedAt: text("card_saved_at"),
  /** Πιστωτικό όριο πελάτη € (0 = χωρίς όριο). */
  creditLimit: real("credit_limit").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const customerActivities = sqliteTable("customer_activities", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  customerId: text("customer_id").notNull(),
  kind: text("kind").notNull(), // call | email | meeting | note | task
  content: text("content").notNull(),
  dueAt: text("due_at"),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  sku: text("sku").default(""),
  name: text("name").notNull(),
  description: text("description").default(""),
  kind: text("kind").notNull().default("service"), // product | service
  unitPrice: real("unit_price").notNull().default(0),
  costPrice: real("cost_price").notNull().default(0),
  vatCategory: integer("vat_category").notNull().default(1),
  vatExemptionCategory: integer("vat_exemption_category"),
  measurementUnit: integer("measurement_unit").notNull().default(1),
  classificationCategory: text("classification_category").notNull().default("category1_3"),
  classificationType: text("classification_type").notNull().default("E3_561_001"),
  trackStock: integer("track_stock", { mode: "boolean" }).notNull().default(false),
  stockQuantity: real("stock_quantity").notNull().default(0),
  reorderLevel: real("reorder_level").notNull().default(0),
  barcode: text("barcode").notNull().default(""),
  /** Μέσο σταθμικό κόστος (ΜΣΚ) – ενημερώνεται με κάθε εισαγωγή με κόστος. */
  avgCost: real("avg_cost").notNull().default(0),
  category: text("category").notNull().default(""),
  tags: text("tags").notNull().default("[]"),
  customFieldsJson: text("custom_fields_json").notNull().default("{}"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  customerId: text("customer_id"),
  seriesId: text("series_id").notNull(),
  seriesCode: text("series_code").notNull(),
  number: integer("number").notNull(),
  invoiceType: text("invoice_type").notNull(),
  issueDate: text("issue_date").notNull(),
  dueDate: text("due_date"),
  warehouseId: text("warehouse_id"),
  currency: text("currency").notNull().default("EUR"),
  exchangeRate: real("exchange_rate"),
  paymentMethod: integer("payment_method").notNull().default(1),
  status: text("status").notNull().default("draft"), // draft | issued | partially_paid | paid | cancelled | accepted | rejected | converted
  notes: text("notes").default(""),
  correlatedInvoiceId: text("correlated_invoice_id"),
  /** Πηγή (π.χ. προσφορά που μετατράπηκε, επαναλαμβανόμενο πρότυπο). */
  sourceQuoteId: text("source_quote_id"),
  recurringTemplateId: text("recurring_template_id"),
  /** Δημόσιο token για προβολή/πληρωμή από τον πελάτη χωρίς login. */
  publicToken: text("public_token"),
  lastReminderAt: text("last_reminder_at"),
  reminderCount: integer("reminder_count").notNull().default(0),
  emailedAt: text("emailed_at"),
  // Δελτίο αποστολής (9.3) – στοιχεία διακίνησης
  dispatchDate: text("dispatch_date"),
  vehicleNumber: text("vehicle_number"),
  movePurpose: integer("move_purpose"),
  deliveryAddress: text("delivery_address"),
  loadingAddress: text("loading_address"),
  /** Αυτοτιμολόγηση (selfPricing) – ο λήπτης εκδίδει για λογαριασμό του εκδότη. */
  selfPricing: integer("self_pricing", { mode: "boolean" }).notNull().default(false),
  branch: integer("branch").notNull().default(0),
  /** Stripe Checkout session για online πληρωμή από τον πελάτη. */
  paymentSessionId: text("payment_session_id"),
  tags: text("tags").notNull().default("[]"),
  customFieldsJson: text("custom_fields_json").notNull().default("{}"),
  salespersonId: text("salesperson_id"),
  channel: text("channel").notNull().default(""),
  /** Παρακολούθηση ανοίγματος από τον πελάτη. */
  viewedAt: text("viewed_at"),
  viewCount: integer("view_count").notNull().default(0),
  /** Αποδοχή προσφοράς από τον πελάτη (ηλεκτρονική «υπογραφή»). */
  acceptedByName: text("accepted_by_name"),
  acceptedAt: text("accepted_at"),
  acceptedIp: text("accepted_ip"),
  /** Ηλεκτρονική υπογραφή (PNG data URL) που σχεδίασε ο πελάτης κατά την αποδοχή. */
  acceptedSignature: text("accepted_signature"),
  decisionNote: text("decision_note"),
  // Snapshot στοιχείων πελάτη τη στιγμή έκδοσης
  customerName: text("customer_name").default(""),
  customerAfm: text("customer_afm").default(""),
  customerDoy: text("customer_doy").default(""),
  customerAddress: text("customer_address").default(""),
  customerCountry: text("customer_country").default("GR"),
  // Σύνολα
  totalNetValue: real("total_net_value").notNull().default(0),
  totalVatAmount: real("total_vat_amount").notNull().default(0),
  totalWithheldAmount: real("total_withheld_amount").notNull().default(0),
  totalStampDutyAmount: real("total_stamp_duty_amount").notNull().default(0),
  totalGrossValue: real("total_gross_value").notNull().default(0),
  paidAmount: real("paid_amount").notNull().default(0),
  // myDATA
  mydataStatus: text("mydata_status").notNull().default("not_sent"), // not_sent | sent | error | cancelled
  mydataMark: text("mydata_mark"),
  mydataUid: text("mydata_uid"),
  mydataAuthCode: text("mydata_auth_code"),
  mydataQrUrl: text("mydata_qr_url"),
  mydataCancellationMark: text("mydata_cancellation_mark"),
  mydataError: text("mydata_error"),
  mydataSentAt: text("mydata_sent_at"),
  mydataRequestXml: text("mydata_request_xml"),
  mydataResponseXml: text("mydata_response_xml"),
  // Τιμολόγηση Δημοσίου (B2G / PEPPOL)
  b2gStatus: text("b2g_status").notNull().default("not_sent"), // not_sent | pending | sent | accepted | rejected | error
  b2gProvider: text("b2g_provider").notNull().default(""),
  b2gProviderId: text("b2g_provider_id"),
  b2gRawStatus: text("b2g_raw_status"),
  b2gError: text("b2g_error"),
  b2gSentAt: text("b2g_sent_at"),
  b2gStatusAt: text("b2g_status_at"),
  b2gXml: text("b2g_xml"),
  b2gBuyerReference: text("b2g_buyer_reference").notNull().default(""),
  b2gContractAdam: text("b2g_contract_adam").notNull().default(""),
  b2gProjectReference: text("b2g_project_reference").notNull().default(""),
  b2gOrderReference: text("b2g_order_reference").notNull().default(""),
  b2gCpv: text("b2g_cpv").notNull().default(""),
  b2gSoftReject: integer("b2g_soft_reject", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const invoiceLines = sqliteTable("invoice_lines", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull(),
  lineNumber: integer("line_number").notNull(),
  productId: text("product_id"),
  description: text("description").notNull(),
  quantity: real("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull().default(0),
  discountPercent: real("discount_percent").notNull().default(0),
  vatCategory: integer("vat_category").notNull().default(1),
  vatExemptionCategory: integer("vat_exemption_category"),
  measurementUnit: integer("measurement_unit").notNull().default(1),
  classificationCategory: text("classification_category").notNull(),
  classificationType: text("classification_type").notNull(),
  withholdingCategory: integer("withholding_category").notNull().default(0),
  stampDutyCategory: integer("stamp_duty_category").notNull().default(0),
  netValue: real("net_value").notNull().default(0),
  vatAmount: real("vat_amount").notNull().default(0),
  withheldAmount: real("withheld_amount").notNull().default(0),
  stampDutyAmount: real("stamp_duty_amount").notNull().default(0),
  grossValue: real("gross_value").notNull().default(0),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  invoiceId: text("invoice_id").notNull(),
  amount: real("amount").notNull(),
  paidAt: text("paid_at").notNull(),
  method: integer("method").notNull().default(1),
  reference: text("reference").default(""),
  /** Λογαριασμός ταμείου/τράπεζας στον οποίο μπήκε η είσπραξη (A9). */
  accountId: text("account_id"),
  /** Συμψηφισμός (A13): "advance" = από πιστωτικό υπόλοιπο/προκαταβολές, "credit_note" = από πιστωτικό τιμολόγιο. Null = πραγματική είσπραξη. */
  offsetSource: text("offset_source"),
  /** Το πιστωτικό τιμολόγιο (ή η κίνηση ledger) από όπου προήλθε ο συμψηφισμός. */
  offsetRefId: text("offset_ref_id"),
  createdAt: text("created_at").notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  detail: text("detail").default(""),
  actorId: text("actor_id"),
  actorName: text("actor_name"),
  ipAddress: text("ip_address"),
  createdAt: text("created_at").notNull(),
});

/** Εσωτερικές σημειώσεις/σχόλια ομάδας σε παραστατικά, πελάτες και δαπάνες (δεν εμφανίζονται στον πελάτη). */
export const documentNotes = sqliteTable(
  "document_notes",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    authorId: text("author_id"),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    /** internal: μόνο ομάδα · customer: ορατό και στον πελάτη (δημόσια σελίδα/portal). */
    visibility: text("visibility").notNull().default("internal"),
    /** user: μέλος ομάδας · customer: ο πελάτης από τη δημόσια σελίδα. */
    authorType: text("author_type").notNull().default("user"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("document_notes_entity_idx").on(t.orgId, t.entityType, t.entityId)],
);

/** Συνημμένα αρχεία (αποθηκεύονται base64 στη βάση ώστε να λειτουργεί και σε serverless χωρίς δίσκο). */
export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    data: text("data").notNull(),
    uploadedBy: text("uploaded_by"),
    uploadedByName: text("uploaded_by_name"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("attachments_entity_idx").on(t.orgId, t.entityType, t.entityId)],
);

export type DocumentNote = typeof documentNotes.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type DocumentView = typeof documentViews.$inferSelect;

export type Organization = typeof organizations.$inferSelect;
export type Series = typeof series.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type CustomerActivity = typeof customerActivities.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type EmailOutbox = typeof emailOutbox.$inferSelect;
export type RecurringTemplate = typeof recurringTemplates.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;

/** Αποθηκευτικοί χώροι (A7). */
export const warehouses = sqliteTable("warehouses", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  code: text("code").notNull().default(""),
  address: text("address").notNull().default(""),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

/** Κινήσεις αποθήκης – κάθε αλλαγή ποσότητας είναι μία γραμμή (θετική = εισαγωγή, αρνητική = εξαγωγή). */
export const stockMovements = sqliteTable("stock_movements", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  productId: text("product_id").notNull(),
  warehouseId: text("warehouse_id").notNull(),
  quantity: real("quantity").notNull(),
  /** Κόστος μονάδας (για εισαγωγές/αγορές) – τροφοδοτεί το μέσο σταθμικό κόστος. */
  unitCost: real("unit_cost"),
  kind: text("kind").notNull(), // in | out | adjustment | transfer | sale | sale_reversal | purchase | count | opening
  refType: text("ref_type").notNull().default("manual"), // manual | invoice | expense | count | transfer
  refId: text("ref_id"),
  note: text("note").notNull().default(""),
  movedAt: text("moved_at").notNull(),
  actor: text("actor").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

/** Απογραφές: καταμέτρηση ανά αποθήκη και αυτόματες διορθωτικές κινήσεις κατά την οριστικοποίηση. */
export const stockCounts = sqliteTable("stock_counts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  warehouseId: text("warehouse_id").notNull(),
  status: text("status").notNull().default("draft"), // draft | posted
  note: text("note").notNull().default(""),
  countedAt: text("counted_at").notNull(),
  postedAt: text("posted_at"),
  createdAt: text("created_at").notNull(),
});

export const stockCountLines = sqliteTable("stock_count_lines", {
  id: text("id").primaryKey(),
  countId: text("count_id").notNull(),
  productId: text("product_id").notNull(),
  expectedQuantity: real("expected_quantity").notNull().default(0),
  countedQuantity: real("counted_quantity"),
});

export type Warehouse = typeof warehouses.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type StockCount = typeof stockCounts.$inferSelect;
export type StockCountLine = typeof stockCountLines.$inferSelect;

/** Λογαριασμοί ταμείου & τραπεζών (A9). */
export const cashAccounts = sqliteTable("cash_accounts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("bank"), // bank | cash | card | other
  iban: text("iban").notNull().default(""),
  bankName: text("bank_name").notNull().default(""),
  currency: text("currency").notNull().default("EUR"),
  openingBalance: real("opening_balance").notNull().default(0),
  openingDate: text("opening_date"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

/** Λοιπές κινήσεις λογαριασμών: μεταφορές, προμήθειες, τόκοι, λοιπές εισπράξεις/πληρωμές. */
export const cashEntries = sqliteTable("cash_entries", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  accountId: text("account_id").notNull(),
  amount: real("amount").notNull(), // θετικό = εισροή, αρνητικό = εκροή
  kind: text("kind").notNull(), // transfer | fee | interest | other_in | other_out | owner_in | owner_out | tax
  note: text("note").notNull().default(""),
  /** Κοινό id για τα δύο σκέλη μιας μεταφοράς. */
  transferId: text("transfer_id"),
  movedAt: text("moved_at").notNull(),
  createdAt: text("created_at").notNull(),
});

/** Γραμμές extrait (statement) που εισάγονται από CSV για συμφωνία. */
export const bankTransactions = sqliteTable("bank_transactions", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  accountId: text("account_id").notNull(),
  bookedAt: text("booked_at").notNull(),
  amount: real("amount").notNull(),
  description: text("description").notNull().default(""),
  counterparty: text("counterparty").notNull().default(""),
  reference: text("reference").notNull().default(""),
  balanceAfter: real("balance_after"),
  /** Αποτύπωμα (ημερομηνία+ποσό+περιγραφή) για αποφυγή διπλής εισαγωγής. */
  fingerprint: text("fingerprint").notNull(),
  importBatchId: text("import_batch_id").notNull(),
  status: text("status").notNull().default("unmatched"), // unmatched | matched | ignored
  matchedType: text("matched_type"), // payment | expense_payment | entry
  matchedId: text("matched_id"),
  matchNote: text("match_note").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

/** Ημερήσιο στιγμιότυπο σκορ συμμόρφωσης (καρτέλα «Κίνδυνοι») – ιστορικό βελτίωσης. */
export const riskSnapshots = sqliteTable("risk_snapshots", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  day: text("day").notNull(),
  score: integer("score").notNull().default(100),
  findings: integer("findings").notNull().default(0),
  critical: integer("critical").notNull().default(0),
  high: integer("high").notNull().default(0),
  codesJson: text("codes_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

export type RiskSnapshot = typeof riskSnapshots.$inferSelect;

/** Παρτίδα εισαγωγής CSV – επιτρέπει αναίρεση όλων των εγγραφών που δημιουργήθηκαν. */
export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  kind: text("kind").notNull(),
  fileName: text("file_name").notNull().default(""),
  created: integer("created").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  refsJson: text("refs_json").notNull().default("[]"),
  undoneAt: text("undone_at"),
  actor: text("actor").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export type ImportBatch = typeof importBatches.$inferSelect;

/** Καρφιτσωμένες/πρόσφατες επιχειρήσεις ανά χρήστη (γρήγορη εναλλαγή στο cockpit). */
export const orgPins = sqliteTable("org_pins", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  orgId: text("org_id").notNull(),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(true),
  lastOpenedAt: text("last_opened_at"),
  createdAt: text("created_at").notNull(),
});

/** Εκκρεμότητες γραφείου cross-company με ανάθεση και προθεσμία (SLA). */
export const officeTasks = sqliteTable("office_tasks", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  severity: text("severity").notNull().default("medium"),
  assigneeUserId: text("assignee_user_id"),
  dueDate: text("due_date"),
  status: text("status").notNull().default("open"),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type OrgPin = typeof orgPins.$inferSelect;

/** Κλείδωμα περιόδου: μετά την υποβολή δηλώσεων δεν επιτρέπονται αναδρομικές αλλαγές. */
export const periodLocks = sqliteTable("period_locks", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  month: text("month").notNull(),
  lockedBy: text("locked_by").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

/** Αίτημα εγγράφων προς τον πελάτη με link χωρίς login. */
export const docRequests = sqliteTable("doc_requests", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  token: text("token").notNull(),
  title: text("title").notNull().default(""),
  itemsJson: text("items_json").notNull().default("[]"),
  message: text("message").notNull().default(""),
  status: text("status").notNull().default("open"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export type PeriodLock = typeof periodLocks.$inferSelect;
export type DocRequest = typeof docRequests.$inferSelect;

/** Προφίλ λογιστικού γραφείου – ξεχωριστή εγγραφή από τις επιχειρήσεις. */
export const accountantProfiles = sqliteTable("accountant_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  firmName: text("firm_name").notNull().default(""),
  afm: text("afm").notNull().default(""),
  phone: text("phone").notNull().default(""),
  city: text("city").notNull().default(""),
  /** Α.Μ. ΟΕΕ / άδεια λογιστή, όνομα υπογράφοντος και σφραγίδα για αυθεντικοποιημένα έγγραφα. */
  regNo: text("reg_no").notNull().default(""),
  signatureName: text("signature_name").notNull().default(""),
  stampDataUrl: text("stamp_data_url").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

/** Μητρώο αυθεντικοποιημένων εγγράφων (κωδικός + hash + δημόσια επαλήθευση). */
export const issuedDocuments = sqliteTable(
  "issued_documents",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    orgId: text("org_id").notNull(),
    /** closing | balance | trial | payroll | apd | fmy | ergani | other */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    period: text("period").notNull().default(""),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    hash: text("hash").notNull(),
    size: integer("size").notNull().default(0),
    data: text("data").notNull().default(""),
    issuedByUserId: text("issued_by_user_id").notNull().default(""),
    issuedByName: text("issued_by_name").notNull().default(""),
    firmName: text("firm_name").notNull().default(""),
    regNo: text("reg_no").notNull().default(""),
    revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("issued_documents_code_idx").on(t.code), index("issued_documents_org_idx").on(t.orgId, t.createdAt)],
);

export type IssuedDocument = typeof issuedDocuments.$inferSelect;

/* ---------------------------- Μισθοδοσία & πάγια ---------------------------- */

export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    afm: text("afm").notNull().default(""),
    amka: text("amka").notNull().default(""),
    efkaAm: text("efka_am").notNull().default(""),
    specialtyCode: text("specialty_code").notNull().default(""),
    specialtyName: text("specialty_name").notNull().default(""),
    /** ΚΠΚ ΕΦΚΑ (πακέτο κάλυψης) */
    kpk: text("kpk").notNull().default("101"),
    /** full | part | shift | seasonal */
    contractType: text("contract_type").notNull().default("full"),
    hireDate: text("hire_date").notNull(),
    endDate: text("end_date"),
    grossSalary: real("gross_salary").notNull().default(0),
    dailyWage: real("daily_wage").notNull().default(0),
    hoursPerWeek: real("hours_per_week").notNull().default(40),
    children: integer("children").notNull().default(0),
    iban: text("iban").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    portalToken: text("portal_token").notNull().default(""),
    portalPin: text("portal_pin").notNull().default(""),
    birthDate: text("birth_date").notNull().default(""),
    /** 0 άνδρας | 1 γυναίκα */
    sex: text("sex").notNull().default("0"),
    fatherName: text("father_name").notNull().default(""),
    motherName: text("mother_name").notNull().default(""),
    nationality: text("nationality").notNull().default("000"),
    idType: text("id_type").notNull().default("ΑΔΤ"),
    idNumber: text("id_number").notNull().default(""),
    maritalStatus: text("marital_status").notNull().default("0"),
    doy: text("doy").notNull().default(""),
    educationLevel: text("education_level").notNull().default(""),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("employees_org_idx").on(t.orgId, t.active)],
);

/** Αιτήματα άδειας από την πύλη εργαζομένου. */
export const leaveRequests = sqliteTable(
  "leave_requests",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    employeeId: text("employee_id").notNull(),
    employeeName: text("employee_name").notNull().default(""),
    /** Κωδικός ΕΡΓΑΝΗ: ΑΔΚΑΝ, ΑΔΑΑ, ΑΔΑΣ, ... */
    leaveType: text("leave_type").notNull().default("ΑΔΚΑΝ"),
    fromDate: text("from_date").notNull(),
    toDate: text("to_date").notNull(),
    days: integer("days").notNull().default(1),
    reason: text("reason").notNull().default(""),
    /** pending | approved | rejected */
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by").notNull().default(""),
    decidedAt: text("decided_at"),
    decisionNote: text("decision_note").notNull().default(""),
    erganiProtocol: text("ergani_protocol").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("leave_requests_org_idx").on(t.orgId, t.status)],
);

export type LeaveRequest = typeof leaveRequests.$inferSelect;

/** Διαπιστευτήρια ΕΡΓΑΝΗ ΙΙ ανά επιχείρηση (καταχωρούνται από το UI). */
export const erganiCredentials = sqliteTable("ergani_credentials", {
  orgId: text("org_id").primaryKey(),
  username: text("username").notNull().default(""),
  password: text("password").notNull().default(""),
  /** trial | live */
  mode: text("mode").notNull().default("trial"),
  employerAfm: text("employer_afm").notNull().default(""),
  employerName: text("employer_name").notNull().default(""),
  annexAa: text("annex_aa").notNull().default("0"),
  sepe: text("sepe").notNull().default(""),
  oaed: text("oaed").notNull().default(""),
  kad: text("kad").notNull().default(""),
  kallikratis: text("kallikratis").notNull().default(""),
  cardSector: integer("card_sector", { mode: "boolean" }).notNull().default(false),
  verifiedAt: text("verified_at").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const erganiSubmissions = sqliteTable(
  "ergani_submissions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    form: text("form").notNull(),
    period: text("period").notNull().default(""),
    /** sent | failed */
    status: text("status").notNull().default("sent"),
    protocol: text("protocol").notNull().default(""),
    response: text("response").notNull().default(""),
    fileName: text("file_name").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("ergani_submissions_org_idx").on(t.orgId, t.createdAt)],
);

/** Αποχωρήσεις / απολύσεις με υπολογισμό αποζημίωσης. */
export const terminations = sqliteTable(
  "terminations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    employeeId: text("employee_id").notNull(),
    employeeName: text("employee_name").notNull().default(""),
    /** dismissal (Ε6) | contract_end (Ε7) | resignation (Ε5) */
    kind: text("kind").notNull().default("dismissal"),
    endDate: text("end_date").notNull(),
    withNotice: integer("with_notice", { mode: "boolean" }).notNull().default(false),
    serviceYears: real("service_years").notNull().default(0),
    monthsOwed: real("months_owed").notNull().default(0),
    monthlyBase: real("monthly_base").notNull().default(0),
    gross: real("gross").notNull().default(0),
    tax: real("tax").notNull().default(0),
    net: real("net").notNull().default(0),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("terminations_org_idx").on(t.orgId)],
);

export type Termination = typeof terminations.$inferSelect;
export type ErganiSubmission = typeof erganiSubmissions.$inferSelect;

export const payrollRuns = sqliteTable(
  "payroll_runs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    month: text("month").notNull(),
    /** monthly | xmas | easter | leave */
    kind: text("kind").notNull().default("monthly"),
    status: text("status").notNull().default("draft"),
    grossTotal: real("gross_total").notNull().default(0),
    efkaEmployee: real("efka_employee").notNull().default(0),
    efkaEmployer: real("efka_employer").notNull().default(0),
    taxTotal: real("tax_total").notNull().default(0),
    netTotal: real("net_total").notNull().default(0),
    glEntryId: text("gl_entry_id").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("payroll_runs_org_month_idx").on(t.orgId, t.month)],
);

export const payrollItems = sqliteTable(
  "payroll_items",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    runId: text("run_id").notNull(),
    employeeId: text("employee_id").notNull(),
    employeeName: text("employee_name").notNull().default(""),
    days: real("days").notNull().default(25),
    hours: real("hours").notNull().default(0),
    overtimeHours: real("overtime_hours").notNull().default(0),
    overtimeAmount: real("overtime_amount").notNull().default(0),
    bonus: real("bonus").notNull().default(0),
    gross: real("gross").notNull().default(0),
    efkaEmployee: real("efka_employee").notNull().default(0),
    efkaEmployer: real("efka_employer").notNull().default(0),
    taxable: real("taxable").notNull().default(0),
    tax: real("tax").notNull().default(0),
    net: real("net").notNull().default(0),
    note: text("note").notNull().default(""),
  },
  (t) => [index("payroll_items_run_idx").on(t.runId)],
);

export const shifts = sqliteTable(
  "shifts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    employeeId: text("employee_id").notNull(),
    workDate: text("work_date").notNull(),
    startTime: text("start_time").notNull().default(""),
    endTime: text("end_time").notNull().default(""),
    breakMinutes: integer("break_minutes").notNull().default(0),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    /** work | leave | sick | off */
    kind: text("kind").notNull().default("work"),
    erganiStatus: text("ergani_status").notNull().default("pending"),
    erganiRef: text("ergani_ref").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("shifts_org_date_idx").on(t.orgId, t.workDate)],
);

export const fixedAssets = sqliteTable(
  "fixed_assets",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default(""),
    accountCode: text("account_code").notNull().default("12"),
    acquiredAt: text("acquired_at").notNull(),
    cost: real("cost").notNull().default(0),
    salvage: real("salvage").notNull().default(0),
    usefulYears: real("useful_years").notNull().default(5),
    method: text("method").notNull().default("straight"),
    disposedAt: text("disposed_at"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("fixed_assets_org_idx").on(t.orgId, t.active)],
);

export type Employee = typeof employees.$inferSelect;
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type PayrollItem = typeof payrollItems.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type FixedAsset = typeof fixedAssets.$inferSelect;

/** «Πάντρεμα» γραφείου με συνεργαζόμενη επιχείρηση (ο ιδιοκτήτης εγκρίνει). */
export const firmLinks = sqliteTable("firm_links", {
  id: text("id").primaryKey(),
  accountantUserId: text("accountant_user_id").notNull(),
  orgId: text("org_id").notNull(),
  status: text("status").notNull().default("pending"),
  requestedAfm: text("requested_afm").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull(),
  decidedAt: text("decided_at"),
  /** full | read | mydata – ορίζεται από την επιχείρηση. */
  accessLevel: text("access_level").notNull().default("full"),
  /** Συνεργάτης του γραφείου που έχει αναλάβει τον πελάτη. */
  assigneeUserId: text("assignee_user_id"),
  /** afm | code | invite */
  source: text("source").notNull().default("afm"),
});

/** Συνεργάτες λογιστικού γραφείου (partner/staff) κάτω από τον ιδιοκτήτη του γραφείου. */
export const firmMembers = sqliteTable("firm_members", {
  id: text("id").primaryKey(),
  firmUserId: text("firm_user_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("staff"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
});

/** Προσκλήσεις συνεργατών στο γραφείο (με token). */
export const firmStaffInvites = sqliteTable("firm_staff_invites", {
  id: text("id").primaryKey(),
  firmUserId: text("firm_user_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("staff"),
  token: text("token").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

/** Πρόσκληση επιχείρησης → λογιστικό γραφείο (με email γραφείου). */
export const firmLinkInvites = sqliteTable("firm_link_invites", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  email: text("email").notNull(),
  note: text("note").notNull().default(""),
  accessLevel: text("access_level").notNull().default("full"),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

/** Αμοιβή γραφείου ανά πελάτη (συνδρομή). */
export const firmFees = sqliteTable("firm_fees", {
  id: text("id").primaryKey(),
  firmUserId: text("firm_user_id").notNull(),
  orgId: text("org_id").notNull(),
  amount: real("amount").notNull().default(0),
  cadence: text("cadence").notNull().default("monthly"),
  note: text("note").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

/** Χρεώσεις αμοιβών ανά μήνα. */
export const firmFeeCharges = sqliteTable("firm_fee_charges", {
  id: text("id").primaryKey(),
  firmUserId: text("firm_user_id").notNull(),
  orgId: text("org_id").notNull(),
  month: text("month").notNull(),
  amount: real("amount").notNull().default(0),
  status: text("status").notNull().default("unpaid"),
  paidAt: text("paid_at"),
  createdAt: text("created_at").notNull(),
});

export type FirmMember = typeof firmMembers.$inferSelect;
export type FirmStaffInvite = typeof firmStaffInvites.$inferSelect;
export type FirmLinkInvite = typeof firmLinkInvites.$inferSelect;
export type FirmFee = typeof firmFees.$inferSelect;
export type FirmFeeCharge = typeof firmFeeCharges.$inferSelect;

export type AccountantProfile = typeof accountantProfiles.$inferSelect;
export type FirmLink = typeof firmLinks.$inferSelect;
export type OfficeTask = typeof officeTasks.$inferSelect;

export type CashAccount = typeof cashAccounts.$inferSelect;
export type CashEntry = typeof cashEntries.$inferSelect;
export type BankTransaction = typeof bankTransactions.$inferSelect;

/** Κανόνες που «μαθαίνουν» από τις εγκρίσεις συμφωνίας extrait. */
export const bankRules = sqliteTable("bank_rules", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  /** Κανονικοποιημένη λέξη-κλειδί από περιγραφή/αντισυμβαλλόμενο. */
  keyword: text("keyword").notNull(),
  /** entry | invoice_customer | expense_supplier | ignore */
  action: text("action").notNull(),
  entryKind: text("entry_kind").notNull().default(""),
  targetName: text("target_name").notNull().default(""),
  hits: integer("hits").notNull().default(0),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull(),
});

export type BankRule = typeof bankRules.$inferSelect;

/** Προσωποποιημένο dashboard λογιστικού γραφείου ανά χρήστη (λίστα widgets με μέγεθος/σειρά). */
export const officeDashboards = sqliteTable("office_dashboards", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  widgetsJson: text("widgets_json").notNull().default("[]"),
  updatedAt: text("updated_at").notNull(),
});

export type OfficeDashboard = typeof officeDashboards.$inferSelect;

/* ---------------------------- Διπλογραφικά (Γενική Λογιστική) ---------------------------- */

/** Λογιστικό σχέδιο ανά επιχείρηση (ΕΛΠ ή ΕΓΛΣ). */
export const glAccounts = sqliteTable(
  "gl_accounts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** asset | liability | equity | income | expense */
    type: text("type").notNull(),
    parentCode: text("parent_code").notNull().default(""),
    plan: text("plan").notNull().default("elp"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("gl_accounts_org_code_idx").on(t.orgId, t.code)],
);

/** Άρθρο ημερολογίου. */
export const glEntries = sqliteTable(
  "gl_entries",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    entryNo: integer("entry_no").notNull().default(0),
    entryDate: text("entry_date").notNull(),
    description: text("description").notNull().default(""),
    /** invoice | expense | payment | bank | payroll | depreciation | manual | closing */
    sourceType: text("source_type").notNull().default("manual"),
    sourceId: text("source_id").notNull().default(""),
    status: text("status").notNull().default("posted"),
    fiscalYear: integer("fiscal_year").notNull(),
    createdBy: text("created_by").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("gl_entries_org_date_idx").on(t.orgId, t.entryDate), index("gl_entries_source_idx").on(t.orgId, t.sourceType, t.sourceId)],
);

/** Γραμμές άρθρου (χρέωση/πίστωση). */
export const glLines = sqliteTable(
  "gl_lines",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    entryId: text("entry_id").notNull(),
    accountCode: text("account_code").notNull(),
    accountName: text("account_name").notNull().default(""),
    debit: real("debit").notNull().default(0),
    credit: real("credit").notNull().default(0),
    description: text("description").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("gl_lines_entry_idx").on(t.entryId), index("gl_lines_account_idx").on(t.orgId, t.accountCode)],
);

export type GlAccount = typeof glAccounts.$inferSelect;
export type GlEntry = typeof glEntries.$inferSelect;
export type GlLine = typeof glLines.$inferSelect;

/**
 * Πιστωτικό υπόλοιπο πελάτη (A13): προκαταβολές, χειροκίνητες πιστώσεις, συμψηφισμοί και επιστροφές.
 * Θετικό ποσό = πίστωση προς τον πελάτη, αρνητικό = χρήση/επιστροφή. Τα πιστωτικά τιμολόγια δεν γράφονται εδώ –
 * το ανεξόφλητο υπόλοιπό τους προστίθεται στο διαθέσιμο πιστωτικό κατά τον υπολογισμό.
 */
export const customerCredits = sqliteTable("customer_credits", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  customerId: text("customer_id").notNull(),
  /** advance | manual | applied | refund */
  kind: text("kind").notNull(),
  amount: real("amount").notNull(),
  /** Λογαριασμός ταμείου/τράπεζας (προκαταβολή = εισροή, επιστροφή = εκροή). */
  accountId: text("account_id"),
  method: integer("method"),
  reference: text("reference").notNull().default(""),
  note: text("note").notNull().default(""),
  /** payment (συμψηφισμός → είσπραξη στόχου) */
  refType: text("ref_type"),
  refId: text("ref_id"),
  movedAt: text("moved_at").notNull(),
  actor: text("actor").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export type CustomerCredit = typeof customerCredits.$inferSelect;

/** Τιμοκατάλογοι (A15): ειδικές τιμές/εκπτώσεις ανά πελάτη και ποσοτικά κλιμάκια. */
export const priceLists = sqliteTable("price_lists", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  currency: text("currency").notNull().default("EUR"),
  /** Γενική έκπτωση % για όλα τα είδη που δεν έχουν ειδική τιμή. */
  discountPercent: real("discount_percent").notNull().default(0),
  /** Ισχύει για πελάτες χωρίς δικό τους τιμοκατάλογο (π.χ. γενικά ποσοτικά κλιμάκια). */
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  validFrom: text("valid_from"),
  validTo: text("valid_to"),
  createdAt: text("created_at").notNull(),
});

export const priceListItems = sqliteTable("price_list_items", {
  id: text("id").primaryKey(),
  priceListId: text("price_list_id").notNull(),
  productId: text("product_id").notNull(),
  /** Ελάχιστη ποσότητα για το κλιμάκιο (1 = βασική τιμή). */
  minQuantity: real("min_quantity").notNull().default(1),
  /** Ειδική τιμή μονάδας (null = τιμή είδους). */
  unitPrice: real("unit_price"),
  /** Έκπτωση % στο κλιμάκιο (null = δεν αλλάζει). */
  discountPercent: real("discount_percent"),
});

export type PriceList = typeof priceLists.$inferSelect;
export type PriceListItem = typeof priceListItems.$inferSelect;

/** Έργα (A16) – εργασίες που τιμολογούνται ανά ώρα ή με σταθερή αμοιβή. */
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    code: text("code").notNull().default(""),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    customerId: text("customer_id"),
    /** active | on_hold | completed | archived */
    status: text("status").notNull().default("active"),
    billable: integer("billable", { mode: "boolean" }).notNull().default(true),
    /** Προεπιλεγμένη ωριαία τιμή έργου (μπορεί να παρακαμφθεί από task). */
    hourlyRate: real("hourly_rate").notNull().default(0),
    budgetAmount: real("budget_amount"),
    budgetHours: real("budget_hours"),
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
    color: text("color").notNull().default("#2563eb"),
    tags: text("tags").notNull().default("[]"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("projects_org_idx").on(t.orgId, t.status)],
);

/** Εργασίες/παραδοτέα έργου – προαιρετική ανάλυση. */
export const projectTasks = sqliteTable(
  "project_tasks",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    /** Ωριαία τιμή task (null = χρησιμοποιείται του έργου). */
    hourlyRate: real("hourly_rate"),
    billable: integer("billable", { mode: "boolean" }).notNull().default(true),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("project_tasks_project_idx").on(t.projectId)],
);

/** Καταγραφές χρόνου (timer ή χειροκίνητα). status: running | logged | invoiced | non_billable */
export const timeEntries = sqliteTable(
  "time_entries",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    projectId: text("project_id").notNull(),
    taskId: text("task_id"),
    userId: text("user_id"),
    userName: text("user_name").notNull().default(""),
    description: text("description").notNull().default(""),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    minutes: integer("minutes").notNull().default(0),
    /** Ωριαία τιμή τη στιγμή καταχώρησης (snapshot). */
    hourlyRate: real("hourly_rate").notNull().default(0),
    billable: integer("billable", { mode: "boolean" }).notNull().default(true),
    status: text("status").notNull().default("logged"),
    invoiceId: text("invoice_id"),
    invoiceLineId: text("invoice_line_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("time_entries_project_idx").on(t.orgId, t.projectId, t.status)],
);

/** Έξοδα έργου (out-of-pocket, μετακίνηση, υλικά) – μπορούν να μετακυλιστούν στο τιμολόγιο. */
export const projectExpenses = sqliteTable(
  "project_expenses",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    projectId: text("project_id").notNull(),
    description: text("description").notNull(),
    amount: real("amount").notNull().default(0),
    incurredOn: text("incurred_on").notNull(),
    billable: integer("billable", { mode: "boolean" }).notNull().default(true),
    markupPercent: real("markup_percent").notNull().default(0),
    invoiceId: text("invoice_id"),
    /** Σύνδεση με παραστατικό εξόδου (αν προέρχεται από αγορά). */
    expenseId: text("expense_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("project_expenses_project_idx").on(t.projectId)],
);

export type Project = typeof projects.$inferSelect;
export type ProjectTask = typeof projectTasks.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type ProjectExpense = typeof projectExpenses.$inferSelect;

/** Ευκαιρίες CRM (kanban pipeline): lead → qualified → quote → won/lost. */
export const opportunities = sqliteTable(
  "opportunities",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    title: text("title").notNull(),
    customerId: text("customer_id"),
    customerName: text("customer_name").notNull().default(""),
    /** lead | qualified | quote | negotiation | won | lost */
    stage: text("stage").notNull().default("lead"),
    amount: real("amount").notNull().default(0),
    probability: integer("probability").notNull().default(20),
    expectedCloseDate: text("expected_close_date"),
    ownerId: text("owner_id"),
    ownerName: text("owner_name").notNull().default(""),
    description: text("description").notNull().default(""),
    lostReason: text("lost_reason").notNull().default(""),
    quoteId: text("quote_id"),
    invoiceId: text("invoice_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    closedAt: text("closed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("opps_org_stage_idx").on(t.orgId, t.stage)],
);

export type Opportunity = typeof opportunities.$inferSelect;

/**
 * Passkeys / WebAuthn credentials — μία εγγραφή ανά συσκευή/authenticator ανά χρήστη.
 * Επιτρέπει passwordless login χωρίς κωδικό και TOTP (η ιδιοκτησία της συσκευής αρκεί).
 */
export const webauthnCredentials = sqliteTable(
  "webauthn_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** base64url-encoded credential id (WebAuthn CredentialID). */
    credentialId: text("credential_id").notNull().unique(),
    /** base64url-encoded COSE public key. */
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    /** CSV από authenticator transports (internal, hybrid, usb, nfc, ble). */
    transports: text("transports").notNull().default(""),
    /** single_device | multi_device (credential backup eligibility). */
    deviceType: text("device_type").notNull().default("multi_device"),
    /** Αν έχει backupped στο cloud (iCloud Keychain, Google Password Manager). */
    backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
    /** Φιλική ονομασία που θέτει ο χρήστης (π.χ. «iPhone εργασίας»). */
    nickname: text("nickname").notNull().default(""),
    lastUsedAt: text("last_used_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("webauthn_credentials_user_id_idx").on(t.userId)],
);

export type WebauthnCredential = typeof webauthnCredentials.$inferSelect;

/**
 * Προσωρινές WebAuthn challenges (registration / authentication) – ισχύουν 5 λεπτά.
 * kind: "registration" (userId set) ή "authentication" (userId προαιρετικό για usernameless).
 */
export const webauthnChallenges = sqliteTable(
  "webauthn_challenges",
  {
    id: text("id").primaryKey(),
    challenge: text("challenge").notNull(),
    kind: text("kind").notNull(),
    userId: text("user_id"),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [index("webauthn_challenges_expires_idx").on(t.expiresAt)],
);

/** Αποφάσεις χρήστη/λογιστή για τις ευκαιρίες του Συμβούλου (apply/dismiss) + audit. */
export const taxOpportunities = sqliteTable(
  "tax_opportunities",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    ruleCode: text("rule_code").notNull(),
    title: text("title").notNull().default(""),
    estimatedBenefit: real("estimated_benefit").notNull().default(0),
    status: text("status").notNull().default("new"),
    decidedBy: text("decided_by"),
    decidedByName: text("decided_by_name"),
    decidedAt: text("decided_at"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("tax_opp_org_rule_idx").on(t.orgId, t.ruleCode)],
);
export type TaxOpportunity = typeof taxOpportunities.$inferSelect;

/** Human sign-off / review log για τους κανόνες του KB (ανά κανόνα & έτος). */
export const taxRuleReviews = sqliteTable(
  "tax_rule_reviews",
  {
    id: text("id").primaryKey(),
    ruleCode: text("rule_code").notNull(),
    taxYear: integer("tax_year").notNull(),
    status: text("status").notNull().default("approved"),
    note: text("note").notNull().default(""),
    reviewedBy: text("reviewed_by"),
    reviewedByName: text("reviewed_by_name"),
    reviewedAt: text("reviewed_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("tax_rule_review_code_year_idx").on(t.ruleCode, t.taxYear)],
);
export type TaxRuleReview = typeof taxRuleReviews.$inferSelect;

/** Ρυθμίσεις πλατφόρμας (single-row) — overrides δυνατοτήτων/ορίων ανά πλάνο από το super-admin. */
export const platformSettings = sqliteTable("platform_settings", {
  id: text("id").primaryKey(),
  planOverridesJson: text("plan_overrides_json").notNull().default("{}"),
  updatedAt: text("updated_at"),
});
export type PlatformSettings = typeof platformSettings.$inferSelect;

/** Ιστορικό ενεργειών super-admin (audit log). */
export const adminAuditLog = sqliteTable("admin_audit_log", {
  id: text("id").primaryKey(),
  adminEmail: text("admin_email").notNull(),
  action: text("action").notNull(),
  targetOrgId: text("target_org_id"),
  detail: text("detail").notNull().default(""),
  createdAt: text("created_at").notNull(),
});
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;

