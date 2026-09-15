/**
 * Καθαρή (χωρίς DB) λογική τιμολόγησης: ποιος τιμοκατάλογος ισχύει για έναν πελάτη και ποια τιμή/έκπτωση
 * προκύπτει για ένα είδος σε δεδομένη ποσότητα. Χρησιμοποιείται τόσο στον editor (client) όσο και στον server.
 */

export interface PricingTier {
  productId: string;
  minQuantity: number;
  unitPrice: number | null;
  discountPercent: number | null;
}

export interface PricingList {
  id: string;
  name: string;
  discountPercent: number;
  isDefault: boolean;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
  items: PricingTier[];
}

export interface PricingCustomer {
  priceListId?: string | null;
  discountPercent?: number | null;
}

export type PriceSource = "product" | "list" | "tier" | "customer";

export interface ResolvedPrice {
  unitPrice: number;
  discountPercent: number;
  source: PriceSource;
  listName: string | null;
  /** Ελάχιστη ποσότητα της κλίμακας που εφαρμόστηκε (αν υπάρχει). */
  tierMinQuantity: number | null;
}

const round = (v: number, d = 2) => Math.round((v + Number.EPSILON) * 10 ** d) / 10 ** d;

export function listIsValidOn(list: Pick<PricingList, "active" | "validFrom" | "validTo">, date: string) {
  if (!list.active) return false;
  if (list.validFrom && date < list.validFrom) return false;
  if (list.validTo && date > list.validTo) return false;
  return true;
}

/** Ο τιμοκατάλογος που ισχύει: του πελάτη (αν είναι ενεργός και εντός ισχύος), αλλιώς ο προεπιλεγμένος. */
export function activeListFor(lists: PricingList[], customer: PricingCustomer | null | undefined, date: string): PricingList | null {
  if (customer?.priceListId) {
    const own = lists.find((l) => l.id === customer.priceListId);
    if (own && listIsValidOn(own, date)) return own;
  }
  return lists.find((l) => l.isDefault && listIsValidOn(l, date)) ?? null;
}

/** Η κλίμακα (tier) που ισχύει για ποσότητα: μεγαλύτερο minQuantity ≤ qty. */
export function tierFor(list: PricingList, productId: string, quantity: number): PricingTier | null {
  const q = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  return (
    list.items
      .filter((i) => i.productId === productId && i.minQuantity <= q)
      .sort((a, b) => b.minQuantity - a.minQuantity)[0] ?? null
  );
}

export function resolveLinePrice(input: {
  product: { id: string; unitPrice: number };
  quantity: number;
  customer?: PricingCustomer | null;
  lists: PricingList[];
  date: string;
}): ResolvedPrice {
  const { product, quantity, customer, lists, date } = input;
  const customerDiscount = round(Number(customer?.discountPercent ?? 0));
  const list = activeListFor(lists, customer, date);
  if (!list) {
    return { unitPrice: product.unitPrice, discountPercent: customerDiscount, source: customerDiscount ? "customer" : "product", listName: null, tierMinQuantity: null };
  }
  const tier = tierFor(list, product.id, quantity);
  if (tier) {
    if (tier.unitPrice != null) {
      return { unitPrice: round(tier.unitPrice), discountPercent: round(tier.discountPercent ?? 0), source: "tier", listName: list.name, tierMinQuantity: tier.minQuantity };
    }
    if (tier.discountPercent != null) {
      return { unitPrice: product.unitPrice, discountPercent: round(tier.discountPercent), source: "tier", listName: list.name, tierMinQuantity: tier.minQuantity };
    }
  }
  // Γενική έκπτωση καταλόγου, αλλιώς έκπτωση πελάτη.
  if (list.discountPercent) {
    return { unitPrice: product.unitPrice, discountPercent: round(list.discountPercent), source: "list", listName: list.name, tierMinQuantity: null };
  }
  return { unitPrice: product.unitPrice, discountPercent: customerDiscount, source: customerDiscount ? "customer" : "product", listName: list.name, tierMinQuantity: null };
}

/** Σύντομη περιγραφή προέλευσης τιμής για tooltips/hints. */
export function describePriceSource(r: ResolvedPrice) {
  switch (r.source) {
    case "tier":
      return `Τιμοκατάλογος «${r.listName}» – κλίμακα από ${r.tierMinQuantity} τεμ.`;
    case "list":
      return `Τιμοκατάλογος «${r.listName}» – έκπτωση ${r.discountPercent}%`;
    case "customer":
      return `Έκπτωση πελάτη ${r.discountPercent}%`;
    default:
      return "Τιμή είδους";
  }
}
