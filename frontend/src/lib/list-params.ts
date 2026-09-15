export const PAGE_SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 25;

export function parsePageSize(v: unknown): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

export function parsePage(v: unknown): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Σελιδοποίηση σε μνήμη για λίστες που φορτώνουν όλες τις γραμμές. */
export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(page, pages);
  return { rows: rows.slice((p - 1) * pageSize, p * pageSize), total, page: p, pages, pageSize };
}

/** Δημιουργεί href με τα τρέχοντα params + αλλαγές (κενές τιμές αφαιρούνται). */
export function hrefWith(base: string, current: Record<string, string | number | undefined>, patch: Record<string, string | number | undefined>) {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...current, ...patch })) if (v !== undefined && v !== "" && v !== null) merged[k] = String(v);
  const qs = new URLSearchParams(merged).toString();
  return qs ? `${base}?${qs}` : base;
}
