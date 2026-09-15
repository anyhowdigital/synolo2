import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { employees, erganiCredentials, erganiSubmissions, leaveRequests, shifts, terminations, type Employee, type Organization } from "@/db/schema";
import { listShifts } from "@/lib/services/payroll";

const BASE: Record<string, string> = {
  trial: "https://trialv2eservices.yeka.gr/WebServicesApi/api",
  live: "https://eservices.yeka.gr/WebServicesAPI/api",
};

/** Έντυπα που υποστηρίζονται για απευθείας υποβολή στο ΕΡΓΑΝΗ ΙΙ (κωδικοί Lookup/Submissions). */
export const ERGANI_FORMS = {
  E12: { code: "WRKCardSE", label: "Ε12 · Ψηφιακή κάρτα (άφιξη/αναχώρηση)" },
  E8: { code: "WTOOv", label: "Ε8 · Υπερωρίες" },
  LEAVE: { code: "WTOLeave", label: "Άδειες (Οργάνωση χρόνου)" },
  E4: { code: "WTOWeek", label: "Ε4 · Σταθερό εβδομαδιαίο ωράριο" },
  E3: { code: "WebE3N", label: "Ε3 · Αναγγελία πρόσληψης" },
  E5: { code: "WebE5N", label: "Ε5 · Οικειοθελής αποχώρηση" },
  E6: { code: "WebE6NXP", label: "Ε6 · Καταγγελία χωρίς προειδοποίηση" },
  E6P: { code: "WebE6NMP", label: "Ε6 · Καταγγελία με προειδοποίηση" },
  E7: { code: "WebE7N", label: "Ε7 · Λήξη σύμβασης ορισμένου χρόνου" },
} as const;
export type ErganiForm = keyof typeof ERGANI_FORMS;

type CredRow = typeof erganiCredentials.$inferSelect;

const gr = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const money = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const athensIso = (d: Date) => {
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d).replace(" ", "T");
  const offset = new Intl.DateTimeFormat("en", { timeZone: "Europe/Athens", timeZoneName: "longOffset" }).formatToParts(d).find((part) => part.type === "timeZoneName")!.value.replace("GMT", "");
  return `${p}${offset}`;
};

export async function getErganiCredentials(db: Db, orgId: string) {
  const row = await db.query.erganiCredentials.findFirst({ where: eq(erganiCredentials.orgId, orgId) });
  if (!row) return null;
  const { password: _p, ...rest } = row;
  void _p;
  return { ...rest, hasPassword: !!row.password };
}

export async function saveErganiCredentials(db: Db, orgId: string, data: { username: string; password?: string; mode: "trial" | "live" }) {
  if (!data.username.trim()) throw new Error("Συμπληρώστε όνομα χρήστη ΕΡΓΑΝΗ.");
  const existing = await db.query.erganiCredentials.findFirst({ where: eq(erganiCredentials.orgId, orgId) });
  const password = data.password?.trim() || existing?.password || "";
  if (!password) throw new Error("Συμπληρώστε κωδικό ΕΡΓΑΝΗ.");
  const values = { username: data.username.trim(), password, mode: data.mode === "live" ? "live" : "trial", updatedAt: new Date().toISOString() };
  if (existing) await db.update(erganiCredentials).set(values).where(eq(erganiCredentials.orgId, orgId));
  else await db.insert(erganiCredentials).values({ orgId, ...values });
}

async function call(mode: string, path: string, init: RequestInit, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE[mode] ?? BASE.live}/${path}`, { ...init, signal: ctrl.signal, headers: { "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) } });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    throw new Error((err as Error).name === "AbortError" ? "Το ΕΡΓΑΝΗ δεν απάντησε εγκαίρως (timeout)." : `Αδυναμία σύνδεσης με ΕΡΓΑΝΗ: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

function apiMessage(text: string) {
  try {
    const j = JSON.parse(text) as { message?: string; Message?: string };
    return j.message ?? j.Message ?? text.slice(0, 300);
  } catch {
    return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  }
}

async function authenticate(row: CredRow) {
  const r = await call(row.mode, "Authentication", { method: "POST", body: JSON.stringify({ Username: row.username, Password: row.password, UserType: "01" }) }, 15000);
  if (!r.ok) throw new Error(`ΕΡΓΑΝΗ σύνδεση (${r.status}): ${apiMessage(r.text)}`);
  const j = JSON.parse(r.text) as { accessToken?: string };
  if (!j.accessToken) throw new Error("Το ΕΡΓΑΝΗ δεν επέστρεψε accessToken.");
  return j.accessToken;
}

async function execute<T>(row: CredRow, token: string, service: string, params: Record<string, string> = {}) {
  const r = await call(row.mode, "WebServices/ExecuteService", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ServiceCode: service, Parameters: Object.entries(params).map(([ParameterName, ParameterValue]) => ({ ParameterName, ParameterValue })) }),
  });
  if (!r.ok) throw new Error(`ΕΡΓΑΝΗ ${service} (${r.status}): ${apiMessage(r.text)}`);
  return JSON.parse(r.text) as T;
}

/** Δοκιμή σύνδεσης: αυθεντικοποίηση + ανάκτηση στοιχείων εργοδότη/παραρτήματος (αποθηκεύονται για τις υποβολές). */
export async function testErganiConnection(db: Db, org: Organization) {
  const row = await db.query.erganiCredentials.findFirst({ where: eq(erganiCredentials.orgId, org.id) });
  if (!row) throw new Error("Δεν έχουν καταχωρηθεί διαπιστευτήρια ΕΡΓΑΝΗ.");
  const token = await authenticate(row);
  const emp = await execute<{ EX_BASE_01?: { Ergodotis?: { Afm?: string; Eponimia?: string; IsInCardSector?: string } } }>(row, token, "EX_BASE_01");
  const annex = await execute<{ EX_BASE_02?: { Pararthma?: { Aa?: string; YpiresiaSepe?: string; YpiresiaOaed?: string; Kad?: string; Kallikratis?: string } | { Aa?: string; YpiresiaSepe?: string; YpiresiaOaed?: string; Kad?: string; Kallikratis?: string }[] } }>(row, token, "EX_BASE_02");
  const e = emp.EX_BASE_01?.Ergodotis ?? {};
  const pRaw = annex.EX_BASE_02?.Pararthma;
  const p = (Array.isArray(pRaw) ? pRaw[0] : pRaw) ?? {};
  const info = {
    employerAfm: e.Afm ?? "",
    employerName: e.Eponimia ?? "",
    cardSector: e.IsInCardSector === "1",
    annexAa: p.Aa ?? "0",
    sepe: p.YpiresiaSepe ?? "",
    oaed: p.YpiresiaOaed ?? "",
    kad: p.Kad ?? "",
    kallikratis: p.Kallikratis ?? "",
    verifiedAt: new Date().toISOString(),
  };
  await db.update(erganiCredentials).set(info).where(eq(erganiCredentials.orgId, org.id));
  const afmMismatch = info.employerAfm && org.afm && info.employerAfm !== org.afm;
  return { ...info, afmMismatch };
}

/* ------------------------------ Payload builders ------------------------------ */

const wtoHeader = (row: CredRow, from: string, to: string, comments = "") => ({ f_aa_pararthmatos: row.annexAa || "0", f_rel_protocol: "", f_rel_date: "", f_comments: comments.slice(0, 200), f_from_date: gr(from), f_to_date: gr(to) });

const person = (row: CredRow, emp: Employee) => ({
  f_aa_pararthmatos: row.annexAa || "0",
  f_rel_protocol: "",
  f_rel_date: "",
  f_ypiresia_sepe: row.sepe,
  f_ypiresia_oaed: row.oaed,
  f_kad_pararthmatos: row.kad,
  f_kallikratis_pararthmatos: row.kallikratis,
  f_eponymo: emp.lastName.slice(0, 50),
  f_onoma: emp.firstName.slice(0, 30),
  f_onoma_patros: emp.fatherName,
  f_onoma_mitros: emp.motherName,
  f_birthdate: gr(emp.birthDate),
  f_sex: emp.sex || "0",
  f_yphkoothta: emp.nationality || "000",
  f_typos_taytothtas: emp.idType || "ΑΔΤ",
  f_ar_taytothtas: emp.idNumber,
  f_marital_status: emp.maritalStatus || "0",
  f_arithmos_teknon: String(emp.children),
  f_afm: emp.afm,
  f_doy: emp.doy,
  f_amka: emp.amka,
  f_epipedo_morfosis: emp.educationLevel,
  f_eidikothta: emp.specialtyCode,
  f_kathestosapasxolisis: emp.contractType === "part" ? "1" : emp.contractType === "shift" ? "2" : "0",
  f_xaraktirismos: emp.grossSalary > 0 ? "1" : "0",
  f_comments: "",
});

export function workCardPayload(row: CredRow, org: Organization, rows: { emp: Employee; type: "0" | "1"; date: string; at: Date }[], comments = "") {
  return {
    Cards: {
      Card: [
        {
          f_afm_ergodoti: row.employerAfm || org.afm,
          f_aa: row.annexAa || "0",
          f_comments: comments.slice(0, 200),
          Details: { CardDetails: rows.map((r) => ({ f_afm: r.emp.afm, f_eponymo: r.emp.lastName.slice(0, 50), f_onoma: r.emp.firstName.slice(0, 30), f_type: r.type, f_reference_date: r.date, f_date: athensIso(r.at), f_aitiologia: null })) },
        },
      ],
    },
  };
}

function overtimePayload(row: CredRow, staff: Employee[], shiftRows: (typeof shifts.$inferSelect)[], month: string) {
  const byEmp = new Map<string, (typeof shifts.$inferSelect)[]>();
  for (const s of shiftRows.filter((x) => x.overtimeMinutes > 0 && x.endTime)) byEmp.set(s.employeeId, [...(byEmp.get(s.employeeId) ?? []), s]);
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return {
    WTOS: {
      WTO: [
        {
          ...wtoHeader(row, `${month}-01`, last, `Υπερωρίες ${month}`),
          Ergazomenoi: {
            ErgazomenoiWTO: [...byEmp.entries()].map(([id, list]) => {
              const emp = staff.find((e) => e.id === id)!;
              return {
                f_afm: emp.afm,
                f_eponymo: emp.lastName,
                f_onoma: emp.firstName,
                f_date: gr(list[0].workDate),
                ErgazomenosAnalytics: {
                  ErgazomenosWTOAnalytics: list.map((s) => {
                    const [eh, em] = s.endTime.split(":").map(Number);
                    const start = eh * 60 + em - s.overtimeMinutes;
                    const hh = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;
                    return { f_type: "ΥΠΕΡ", f_from: hh(start), f_to: s.endTime };
                  }),
                },
              };
            }),
          },
        },
      ],
    },
  };
}

function weeklySchedulePayload(row: CredRow, staff: Employee[], shiftRows: (typeof shifts.$inferSelect)[], month: string) {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const DAYS = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];
  return {
    WTOS: {
      WTO: [
        {
          ...wtoHeader(row, `${month}-01`, last, `Σταθερό εβδομαδιαίο ωράριο ${month}`),
          Ergazomenoi: {
            ErgazomenoiWTO: staff
              .filter((e) => e.active)
              .map((emp) => {
                const mine = shiftRows.filter((s) => s.employeeId === emp.id && s.kind === "work" && s.startTime && s.endTime);
                const perDay = new Map<number, { from: string; to: string }>();
                for (const s of mine) {
                  const d = new Date(`${s.workDate}T00:00:00Z`).getUTCDay();
                  if (!perDay.has(d)) perDay.set(d, { from: s.startTime, to: s.endTime });
                }
                const daily = emp.hoursPerWeek > 0 ? emp.hoursPerWeek / 5 : 8;
                const endH = 9 + Math.floor(daily);
                const analytics = [1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const w = perDay.get(d) ?? (d >= 1 && d <= 5 && !perDay.size ? { from: "09:00", to: `${String(endH).padStart(2, "0")}:00` } : null);
                  return w ? { f_type: "ΕΡΓ", f_from: w.from, f_to: w.to, f_day: DAYS[d] } : { f_type: "ΑΝ", f_from: "", f_to: "", f_day: DAYS[d] };
                });
                return { f_afm: emp.afm, f_eponymo: emp.lastName, f_onoma: emp.firstName, f_date: gr(`${month}-01`), ErgazomenosAnalytics: { ErgazomenosWTOAnalytics: analytics.map(({ f_day: _d, ...rest }) => rest) } };
              }),
          },
        },
      ],
    },
  };
}

export function leavePayload(row: CredRow, emp: Employee, lr: typeof leaveRequests.$inferSelect, entitledDays: number) {
  return {
    WTOS: {
      WTO: [
        {
          ...wtoHeader(row, lr.fromDate, lr.toDate, lr.reason),
          Ergazomenoi: {
            ErgazomenoiWTO: [
              {
                f_afm: emp.afm,
                f_eponymo: emp.lastName,
                f_onoma: emp.firstName,
                f_date: gr(lr.fromDate),
                ErgazomenosAnalytics: { ErgazomenosWTOAnalytics: [{ f_type: lr.leaveType, f_from: "", f_to: "", f_year: lr.fromDate.slice(0, 4), f_req_days: String(entitledDays).padStart(3, "0") }] },
              },
            ],
          },
        },
      ],
    },
  };
}

function hiringPayload(row: CredRow, emp: Employee) {
  const p = person(row, emp);
  return {
    AnaggeliesE3N: {
      AnaggeliaE3N: [
        {
          ...p,
          f_proslipsidate: gr(emp.hireDate),
          f_proslipsitime: "09:00",
          f_week_hours: String(emp.hoursPerWeek),
          f_apodoxes: money(emp.grossSalary > 0 ? emp.grossSalary : emp.dailyWage),
          f_sxeshapasxolisis: emp.contractType === "seasonal" ? "1" : "0",
          f_full_employment_hours: "40",
          f_week_days: "5",
          f_working_card: row.cardSector ? "1" : "0",
          f_dialeimma_minutes: "30",
          f_dialeimma_entos_wrariou: "0",
          f_trial_period: "0",
        },
      ],
    },
  };
}

function terminationPayload(row: CredRow, emp: Employee, t: typeof terminations.$inferSelect) {
  const p = person(row, emp);
  const wage = money(emp.grossSalary > 0 ? emp.grossSalary : emp.dailyWage);
  if (t.kind === "dismissal") {
    const key = t.withNotice ? "E6NMP" : "E6NXP";
    return {
      [`Anaggelies${key}`]: {
        [`Anaggelia${key}`]: [{ ...p, f_omadiki: "0", f_proslipsidate: gr(emp.hireDate), f_apolysisdate: gr(t.endDate), f_koinopoihshdate: gr(t.endDate), f_apodoxes: wage, f_posoapozimiosis: money(t.gross), f_comments: t.note.slice(0, 200) }],
      },
    };
  }
  if (t.kind === "contract_end") {
    return { AnaggeliesE7N: { AnaggeliaE7N: [{ ...p, f_sxeshapasxolisis: "1", f_oros: "0", f_proslipsidate: gr(emp.hireDate), f_lixisymbashdate: gr(t.endDate), f_apolysisdate: gr(t.endDate), f_logosperatosis: "0", f_apodoxes: wage, f_comments: t.note.slice(0, 200) }] } };
  }
  return { AnaggeliesE5N: { AnaggeliaE5N: [{ ...p, f_sxeshapasxolisis: "0", f_orismenou_apo: "", f_orismenou_ews: "", f_proslipsidate: gr(emp.hireDate), f_apoxwrisidate: gr(t.endDate), f_apodoxes: wage, f_comments: t.note.slice(0, 200) }] } };
}

/* ------------------------------ Submission ------------------------------ */

async function record(db: Db, orgId: string, form: string, period: string, createdBy: string, result: { ok: boolean; protocol: string; response: string }) {
  const id = randomUUID();
  await db.insert(erganiSubmissions).values({ id, orgId, form, period, status: result.ok ? "sent" : "failed", protocol: result.protocol, response: result.response.slice(0, 2000), fileName: "", createdBy, createdAt: new Date().toISOString() });
  return id;
}

async function post(row: CredRow, code: string, payload: unknown) {
  const token = await authenticate(row);
  const r = await call(row.mode, `Documents/${code}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }, 30000);
  if (!r.ok) return { ok: false, protocol: "", response: `ΕΡΓΑΝΗ ${code} (${r.status}): ${apiMessage(r.text)}` };
  let protocol = "";
  try {
    const j = JSON.parse(r.text) as { protocol?: string; id?: string }[] | { protocol?: string };
    protocol = Array.isArray(j) ? String(j[0]?.protocol ?? j[0]?.id ?? "") : String(j.protocol ?? "");
  } catch {
    protocol = "";
  }
  return { ok: true, protocol, response: r.text };
}

/** Υποβολή εντύπου ΕΡΓΑΝΗ ΙΙ με τα αποθηκευμένα διαπιστευτήρια. Καταγράφεται πάντα στο ιστορικό. */
export async function submitErgani(db: Db, org: Organization, form: ErganiForm, period: string, createdBy = "", refId?: string) {
  const row = await db.query.erganiCredentials.findFirst({ where: eq(erganiCredentials.orgId, org.id) });
  if (!row) throw new Error("Καταχωρήστε πρώτα τα διαπιστευτήρια ΕΡΓΑΝΗ.");
  if (!row.verifiedAt) throw new Error("Πατήστε «Δοκιμή σύνδεσης» για να ανακτηθούν τα στοιχεία παραρτήματος από το ΕΡΓΑΝΗ.");
  const staff = await db.select().from(employees).where(eq(employees.orgId, org.id));
  let code: string = ERGANI_FORMS[form].code;
  let payload: unknown;
  let touchShiftIds: string[] = [];

  try {
    if (form === "E12") {
      const rows = (await listShifts(db, org.id, period)).filter((s) => s.kind === "work" && s.startTime && s.erganiStatus !== "sent");
      if (!rows.length) throw new Error("Δεν υπάρχουν νέες κινήσεις κάρτας για υποβολή.");
      const cards: { emp: Employee; type: "0" | "1"; date: string; at: Date }[] = [];
      for (const s of rows) {
        const emp = staff.find((e) => e.id === s.employeeId);
        if (!emp?.afm) continue;
        cards.push({ emp, type: "0", date: s.workDate, at: new Date(`${s.workDate}T${s.startTime}:00+03:00`) });
        if (s.endTime) cards.push({ emp, type: "1", date: s.workDate, at: new Date(`${s.workDate}T${s.endTime}:00+03:00`) });
      }
      if (!cards.length) throw new Error("Οι εργαζόμενοι των βαρδιών δεν έχουν ΑΦΜ.");
      payload = workCardPayload(row, org, cards, `Κάρτα ${period}`);
      touchShiftIds = rows.map((s) => s.id);
    } else if (form === "E8") {
      const rows = await listShifts(db, org.id, period);
      if (!rows.some((s) => s.overtimeMinutes > 0)) throw new Error("Δεν υπάρχουν υπερωρίες στον μήνα.");
      payload = overtimePayload(row, staff, rows, period);
      touchShiftIds = rows.filter((s) => s.overtimeMinutes > 0).map((s) => s.id);
    } else if (form === "E4") {
      payload = weeklySchedulePayload(row, staff, await listShifts(db, org.id, period), period);
    } else if (form === "E3") {
      const emp = staff.find((e) => e.id === refId);
      if (!emp) throw new Error("Επιλέξτε εργαζόμενο για την αναγγελία πρόσληψης.");
      payload = hiringPayload(row, emp);
    } else if (form === "LEAVE") {
      const lr = await db.query.leaveRequests.findFirst({ where: and(eq(leaveRequests.id, refId ?? ""), eq(leaveRequests.orgId, org.id)) });
      const emp = staff.find((e) => e.id === lr?.employeeId);
      if (!lr || !emp) throw new Error("Το αίτημα άδειας δεν βρέθηκε.");
      payload = leavePayload(row, emp, lr, 20);
    } else {
      const t = await db.query.terminations.findFirst({ where: and(eq(terminations.id, refId ?? ""), eq(terminations.orgId, org.id)) });
      const emp = staff.find((e) => e.id === t?.employeeId);
      if (!t || !emp) throw new Error("Η αποχώρηση δεν βρέθηκε.");
      code = t.kind === "dismissal" ? (t.withNotice ? "WebE6NMP" : "WebE6NXP") : t.kind === "contract_end" ? "WebE7N" : "WebE5N";
      payload = terminationPayload(row, emp, t);
    }
  } catch (err) {
    const id = await record(db, org.id, form, period, createdBy, { ok: false, protocol: "", response: (err as Error).message });
    return { ok: false as const, error: (err as Error).message, id };
  }

  let result: { ok: boolean; protocol: string; response: string };
  try {
    result = await post(row, code, payload);
  } catch (err) {
    result = { ok: false, protocol: "", response: (err as Error).message };
  }
  const id = await record(db, org.id, form, period, createdBy, result);
  if (result.ok && touchShiftIds.length) await db.update(shifts).set({ erganiStatus: "sent", erganiRef: result.protocol || id }).where(and(eq(shifts.orgId, org.id), inArray(shifts.id, touchShiftIds)));
  if (result.ok && form === "LEAVE" && refId) await db.update(leaveRequests).set({ erganiProtocol: result.protocol || id }).where(eq(leaveRequests.id, refId));
  return result.ok ? { ok: true as const, protocol: result.protocol, id } : { ok: false as const, error: result.response, id };
}

/** Άμεση κίνηση ψηφιακής κάρτας (από την πύλη εργαζομένου). Best effort. */
export async function submitWorkCardMove(db: Db, org: Organization, emp: Employee, type: "0" | "1", shiftId: string) {
  const row = await db.query.erganiCredentials.findFirst({ where: eq(erganiCredentials.orgId, org.id) });
  if (!row || !row.verifiedAt || !emp.afm) return null;
  const now = new Date();
  const date = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" });
  let result: { ok: boolean; protocol: string; response: string };
  try {
    result = await post(row, "WRKCardSE", workCardPayload(row, org, [{ emp, type, date, at: now }], type === "0" ? "Άφιξη από πύλη" : "Αναχώρηση από πύλη"));
  } catch (err) {
    result = { ok: false, protocol: "", response: (err as Error).message };
  }
  const id = await record(db, org.id, "E12", date.slice(0, 7), `${emp.lastName} ${emp.firstName} (πύλη)`, result);
  if (result.ok) await db.update(shifts).set({ erganiStatus: "sent", erganiRef: result.protocol || id }).where(eq(shifts.id, shiftId));
  else await db.update(shifts).set({ erganiStatus: "failed" }).where(eq(shifts.id, shiftId));
  return result;
}

export async function listSubmissions(db: Db, orgId: string, limit = 30) {
  return db.select().from(erganiSubmissions).where(eq(erganiSubmissions.orgId, orgId)).orderBy(desc(erganiSubmissions.createdAt)).limit(limit);
}
