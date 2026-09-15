const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Ανάγνωση εύρους ημερομηνιών από searchParams με προεπιλογή τον τρέχοντα μήνα (server-safe). */
export function resolveRange(sp: { from?: string; to?: string; cmp?: string }) {
  const today = new Date();
  const defFrom = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const defTo = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)));
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : defFrom;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : defTo;
  const compare = sp.cmp === "1";
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const prevTo = iso(new Date(Date.parse(from) - 86400000));
  const prevFrom = iso(new Date(Date.parse(from) - days * 86400000));
  return { from, to, compare, days, previous: { from: prevFrom, to: prevTo } };
}
