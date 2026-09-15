/** Ασφαλές για client components – δεν εισάγει βάση/Node APIs. */
export function invoiceDisplayNumber(inv: { seriesCode: string; number: number; status: string }) {
  if (inv.status === "draft" || inv.number === 0) return `${inv.seriesCode}-ΠΡΟΧ.`;
  return `${inv.seriesCode}-${String(inv.number).padStart(4, "0")}`;
}
