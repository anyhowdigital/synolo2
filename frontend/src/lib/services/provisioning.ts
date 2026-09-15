import { randomUUID } from "node:crypto";
import type { Db } from "@/db";
import { organizations, series } from "@/db/schema";
import { addMembership } from "@/lib/auth/session";

export const DEFAULT_SERIES = [
  { code: "ΤΠ", name: "Τιμολόγιο Πώλησης", invoiceType: "1.1" },
  { code: "ΤΠΥ", name: "Τιμολόγιο Παροχής Υπηρεσιών", invoiceType: "2.1" },
  { code: "ΑΠΥ", name: "Απόδειξη Παροχής Υπηρεσιών", invoiceType: "11.2" },
  { code: "ΑΛΠ", name: "Απόδειξη Λιανικής Πώλησης", invoiceType: "11.1" },
  { code: "ΠΤ", name: "Πιστωτικό Τιμολόγιο", invoiceType: "5.1" },
  { code: "ΔΑ", name: "Δελτίο Αποστολής", invoiceType: "9.3" },
  { code: "ΠΡ", name: "Προσφορά", invoiceType: "QUOTE" },
];

export interface NewOrgInput {
  name: string;
  afm: string;
  gemi?: string;
  doy?: string;
  activity?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  email?: string;
  phone?: string;
}

/** Δημιουργία νέου οργανισμού με προεπιλεγμένες σειρές και δοκιμαστική περίοδο 14 ημερών. */
export async function createOrganization(db: Db, ownerUserId: string, input: NewOrgInput) {
  const id = randomUUID();
  const now = new Date();
  await db.insert(organizations).values({
    id,
    name: input.name,
    legalName: input.name,
    afm: input.afm,
    gemi: input.gemi ?? "",
    doy: input.doy ?? "",
    activity: input.activity ?? "",
    address: input.address ?? "",
    city: input.city ?? "",
    postalCode: input.postalCode ?? "",
    country: "GR",
    email: input.email ?? "",
    phone: input.phone ?? "",
    billingEmail: input.email ?? "",
    mydataEnvironment: "mock",
    plan: "trial",
    planStatus: "trialing",
    trialEndsAt: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
    createdAt: now.toISOString(),
  });
  await db.insert(series).values(
    DEFAULT_SERIES.map((s) => ({ id: randomUUID(), orgId: id, ...s, nextNumber: 1, numberingYear: now.getFullYear(), active: true })),
  );
  await addMembership(db, ownerUserId, id, "owner");
  return id;
}
