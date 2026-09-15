// Offline diagnostic tests for src/lib/accounting-bridge/index.ts
// MOCKED fetch only. No real external traffic.
// All stubs below are MOCKED to isolate library logic (no vendor calls, no DB).
// Exit code: 0 = all pass; 1 = one or more diagnostic assertions failed.
// Run:  cd /app/frontend && npx tsx tests/bridge_offline_diag.mjs
//       (persist output: ... 2>&1 | tee /app/test_reports/iter43/bridge_offline_diag.log)

import {
  parseExpenseImport,
  parseProductImport,
  parsePartyImport,
  buildProgramExport,
  pushDataset,
} from "../src/lib/accounting-bridge/index.ts";

const results = [];
const rec = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

// ---- 1) toNum via parseExpenseImport with Greek 1.234,56 ----
try {
  const csv = "date;party;gross\n2026-01-05;ΑΛΦΑ ΑΕ;1.234,56";
  const { docs } = parseExpenseImport("generic", csv);
  const g = docs[0]?.gross;
  rec(
    "parseExpenseImport Greek 1.234,56 -> 1234.56",
    g === 1234.56,
    `got gross=${g}`
  );
} catch (e) { rec("parseExpenseImport Greek", false, String(e)); }

// ---- 2) parseProductImport ΦΠΑ=24 handling ----
// NOTE: myDATA `vatCategory` (per /app/frontend/src/lib/invoice/schema.ts:10) is an
// integer 1..8 (myDATA category code, where rate 24% = category 1). Storing the raw
// rate (24) violates the invoice schema. Therefore vatCategory===24 is a BUG, not PASS.
try {
  const csv = "name;price;ΦΠΑ;κατηγορια\nΥπηρεσία Α;100,00;24;Έσοδα";
  const { products } = parseProductImport("generic", csv);
  const p = products[0];
  rec(
    "parseProductImport ΦΠΑ column maps to myDATA vatCategory 1..8 (rate 24 -> category 1)",
    typeof p?.vatCategory === "number" && p.vatCategory >= 1 && p.vatCategory <= 8,
    `vatCategory=${p?.vatCategory} (expected 1..8; got raw rate) category=${p?.category} price=${p?.unitPrice}`
  );
  rec(
    "parseProductImport price 100,00 -> 100",
    p?.unitPrice === 100,
    `unitPrice=${p?.unitPrice}`
  );
} catch (e) { rec("parseProductImport", false, String(e)); }

// ---- 3) SoftOne export roundtrip via parsePartyImport ----
try {
  const ds = {
    org: { name: "Δοκιμή", afm: "123" },
    period: { from: "2026-01-01", to: "2026-12-31" },
    customers: [{ code: "C001", name: "ΑΛΦΑ ΑΕ", afm: "094111111", doy: "Α'Αθηνών", country: "GR", address: "Οδός 1", city: "Αθήνα", email: "a@a.gr", phone: "2101234567" }],
    suppliers: [], income: [], expenses: [], journal: [],
    counts: { customers: 1, suppliers: 0, income: 0, expenses: 0, journalEntries: 0, journalLines: 0 },
  };
  const out = await buildProgramExport("softone", ds);
  const parsed = parsePartyImport("softone", "customers", out.body);
  rec(
    "SoftOne export → parsePartyImport roundtrip (customers)",
    parsed.parties.length === 1 && parsed.parties[0]?.name === "ΑΛΦΑ ΑΕ",
    `got=${parsed.parties.length} name=${parsed.parties[0]?.name ?? "(none)"} warn=${parsed.warnings.join("|")}`
  );
} catch (e) { rec("SoftOne roundtrip", false, String(e)); }

// ---- 4) buildProgramExport softone with entities={income,expenses} lacks selected ----
try {
  const ds = {
    org: { name: "Ο", afm: "123" }, period: { from: "2026-01-01", to: "2026-12-31" },
    customers: [{ code: "C1", name: "X", afm: "1" }],
    suppliers: [{ code: "S1", name: "Y", afm: "2" }],
    income: [{ id: "i1", series: "A", number: 1, date: "2026-01-02", party: "X", afm: "1", net: 100, vat: 24, gross: 124 }],
    expenses: [{ id: "e1", series: "", number: "1", date: "2026-01-02", party: "Y", afm: "2", net: 50, vat: 12, gross: 62 }],
    journal: [{ entryNo: 1, date: "2026-01-02", description: "d", accountCode: "70", accountName: "Έσοδα", debit: 0, credit: 100 }],
    counts: { customers: 1, suppliers: 1, income: 1, expenses: 1, journalEntries: 1, journalLines: 1 },
  };
  const wanted = new Set(["income", "expenses"]);
  const out = await buildProgramExport("softone", ds, wanted);
  const parsed = JSON.parse(out.body);
  const keys = Object.keys(parsed).filter(k => k !== "meta");
  rec(
    "buildProgramExport(softone, {income,expenses}) contains income/expenses",
    keys.includes("income") && keys.includes("expenses"),
    `keys=${keys.join(",")}`
  );
  rec(
    "buildProgramExport(softone, {income,expenses}) excludes customers/suppliers/journal",
    !keys.includes("customers") && !keys.includes("suppliers") && !keys.includes("journal"),
    `keys=${keys.join(",")}`
  );
} catch (e) { rec("buildProgramExport softone entities", false, String(e)); }

// ---- 5) pushDataset softone: login success:false must STOP and ok:false ----
try {
  const calls = [];
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.service);
    if (body.service === "login") return { ok: true, json: async () => ({ success: false, error: "bad creds" }) };
    return { ok: true, json: async () => ({ success: true }) };
  };
  const ds = { org: { name: "O", afm: "1" }, period: { from: "", to: "" }, customers: [{ code: "1", name: "A", afm: "1" }], suppliers: [], income: [], expenses: [], journal: [], counts: { customers: 1, suppliers: 0, income: 0, expenses: 0, journalEntries: 0, journalLines: 0 } };
  const res = await pushDataset("softone", { baseUrl: "https://x.oncloud.gr/s1services", appId: "a", username: "u", password: "p" }, ds);
  rec(
    "softone login failure → ok:false and no setData called",
    res.ok === false && !calls.includes("setData"),
    `ok=${res.ok} calls=${calls.join(",")} err=${res.error}`
  );
} catch (e) { rec("softone login failure", false, String(e)); }

// ---- 5b) pushDataset softone: login OK, then authenticate success:false must STOP (no setData) ----
try {
  const calls = [];
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body.service);
    if (body.service === "login") return { ok: true, json: async () => ({ success: true, clientID: "X" }) };
    if (body.service === "authenticate") return { ok: true, json: async () => ({ success: false, error: "no company" }) };
    return { ok: true, json: async () => ({ success: true }) };
  };
  const ds = { org: { name: "O", afm: "1" }, period: { from: "", to: "" }, customers: [{ code: "1", name: "A", afm: "1" }], suppliers: [], income: [], expenses: [], journal: [], counts: { customers: 1, suppliers: 0, income: 0, expenses: 0, journalEntries: 0, journalLines: 0 } };
  const res = await pushDataset("softone", { baseUrl: "https://x.oncloud.gr/s1services", appId: "a", username: "u", password: "p", company: "1", branch: "1", module: "1" }, ds);
  rec(
    "softone authenticate success:false → ok:false and no setData called",
    res.ok === false && !calls.includes("setData"),
    `ok=${res.ok} calls=${calls.join(",")} err=${res.error}`
  );
} catch (e) { rec("softone authenticate failure", false, String(e)); }

// ---- 6) pushDataset softone: all setData success:false must NOT be ok:true ----
try {
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.service === "login") return { ok: true, json: async () => ({ success: true, clientID: "X" }) };
    if (body.service === "authenticate") return { ok: true, json: async () => ({ success: true, clientID: "X" }) };
    return { ok: true, json: async () => ({ success: false, error: "denied" }) };
  };
  const ds = { org: { name: "O", afm: "1" }, period: { from: "", to: "" }, customers: [{ code: "1", name: "A", afm: "1" }, { code: "2", name: "B", afm: "2" }], suppliers: [{ code: "3", name: "C", afm: "3" }], income: [], expenses: [], journal: [], counts: { customers: 2, suppliers: 1, income: 0, expenses: 0, journalEntries: 0, journalLines: 0 } };
  const res = await pushDataset("softone", { baseUrl: "https://x.oncloud.gr/s1services", appId: "a", username: "u", password: "p" }, ds);
  rec(
    "softone all setData:false → should NOT report ok:true",
    !(res.ok === true && res.sent.customers === 0 && res.sent.suppliers === 0),
    `ok=${res.ok} sent=${JSON.stringify(res.sent)} msgs=${res.messages?.join("|")}`
  );
} catch (e) { rec("softone all setData failure", false, String(e)); }

// ---- 7) restPush: HTTP 200 with body {success:false} likely reports ok:true ----
try {
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: false, error: "denied" }) });
  const ds = { org: { name: "O", afm: "1" }, period: { from: "", to: "" }, customers: [{ code: "1", name: "A", afm: "1" }], suppliers: [], income: [], expenses: [], journal: [], counts: { customers: 1, suppliers: 0, income: 0, expenses: 0, journalEntries: 0, journalLines: 0 } };
  const res = await pushDataset("generic", { baseUrl: "https://x/api", apiKey: "k" }, ds);
  rec(
    "restPush HTTP200 {success:false} → should NOT report ok:true",
    res.ok === false,
    `ok=${res.ok} msgs=${res.messages?.join("|")}`
  );
} catch (e) { rec("restPush success:false", false, String(e)); }

// summary
const failed = results.filter(r => !r.pass);
console.log(`\n---- Summary: ${results.length - failed.length}/${results.length} passed, ${failed.length} FAILED ----`);
console.log("NOTE: MOCKED global.fetch only — no live vendor traffic.");
for (const f of failed) console.log("  FAIL:", f.name, "-", f.detail);
// Exit non-zero when diagnostic assertions fail (expected during audit; app fix pending).
process.exit(failed.length ? 1 : 0);
