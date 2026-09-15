import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth/session";
import { firmClient, resolveFirm } from "@/lib/services/firm";
import { canManageBooks } from "@/lib/services/gl";
import { eq } from "drizzle-orm";
import { organizations } from "@/db/schema";
import { apdFile, erganiFile, fmyFile, getRun, listEmployees } from "@/lib/services/payroll";
import { sepaPayrollFile } from "@/lib/services/sepa";
import { terminationFile } from "@/lib/services/severance";
import { periodLabel } from "@/lib/services/staff-portal";
import { renderPayslipPdf, payslipFilename } from "@/lib/pdf/payslip-pdf";
import { registerDocument } from "@/lib/services/doc-registry";
import { accountantProfiles } from "@/db/schema";

/** Ασφαλές όνομα αρχείου για HTTP header (τα ελληνικά μόνο στο filename*). */
function disposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Αρχεία & αποδείξεις μισθοδοσίας: ΑΠΔ, ΦΜΥ, ΕΡΓΑΝΗ (E12/E4/E3/E8), απόδειξη αποδοχών. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("org") ?? "";
  const month = url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const kind = url.searchParams.get("kind") ?? "apd";
  const employeeId = url.searchParams.get("employee") ?? "";

  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return new Response("Απαιτείται σύνδεση.", { status: 401 });

  const firm = await resolveFirm(db, user.id);
  let org = null;
  let signer: { name: string; regNo: string; firmName: string } | null = null;
  if (firm) {
    const client = await firmClient(db, firm, orgId);
    if (!client) return new Response("Δεν έχετε πρόσβαση σε αυτόν τον πελάτη.", { status: 403 });
    org = client.org;
    const profile = await db.query.accountantProfiles.findFirst({ where: eq(accountantProfiles.userId, firm.firmUserId) });
    signer = { name: profile?.signatureName || user.name || user.email, regNo: profile?.regNo ?? "", firmName: profile?.firmName ?? firm.firmName };
  } else {
    if (!(await canManageBooks(db, orgId, user.id))) return new Response("Τα στοιχεία μισθοδοσίας τα διαχειρίζεται ο λογιστής σας.", { status: 403 });
    org = (await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) })) ?? null;
  }
  if (!org) return new Response("Η επιχείρηση δεν βρέθηκε.", { status: 404 });

  try {
    if (kind === "sepa") {
      const file = await sepaPayrollFile(db, org, month, url.searchParams.get("iban") ?? "", url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10));
      const buffer = Buffer.from(file.content, "utf8");
      const reg = await registerDocument(db, { orgId: org.id, kind: "payroll", title: `Εμβάσματα μισθοδοσίας ${month} (${file.count})`, period: month, fileName: file.fileName, mimeType: "application/xml", bytes: buffer, userId: user.id, userName: signer?.name ?? user.name ?? user.email });
      return new Response(file.content, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": disposition(file.fileName), "X-Document-Code": reg.code, "X-Missing-Iban": encodeURIComponent(file.missing.join(", ")) } });
    }
    if (kind === "termination") {
      const file = await terminationFile(db, org, url.searchParams.get("termination") ?? "");
      const reg = await registerDocument(db, { orgId: org.id, kind: "ergani", title: `ΕΡΓΑΝΗ ${file.form} αποχώρηση`, period: month, fileName: file.fileName, mimeType: "application/xml", bytes: Buffer.from(file.content, "utf8"), userId: user.id, userName: signer?.name ?? user.name ?? user.email });
      return new Response(file.content, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": disposition(file.fileName), "X-Document-Code": reg.code } });
    }
    if (kind === "payslip") {
      const data = await getRun(db, org.id, month);
      const item = data?.items.find((i) => i.employeeId === employeeId);
      if (!item) return new Response("Δεν βρέθηκε γραμμή μισθοδοσίας.", { status: 404 });
      const emp = (await listEmployees(db, org.id)).find((e) => e.id === employeeId);
      const base = process.env.APP_URL ?? url.origin;
      const label = periodLabel(month);
      const buffer = await renderPayslipPdf({
        org,
        data: {
          month: label,
          employeeName: item.employeeName,
          afm: emp?.afm ?? "",
          amka: emp?.amka ?? "",
          specialty: emp?.specialtyName ?? "",
          days: item.days,
          gross: item.gross,
          overtimeAmount: item.overtimeAmount,
          bonus: item.bonus,
          efkaEmployee: item.efkaEmployee,
          efkaEmployer: item.efkaEmployer,
          tax: item.tax,
          net: item.net,
        },
        signer: signer ? { ...signer, code: "—", verifyUrl: `${base}/verify` } : undefined,
      });
      const reg = await registerDocument(db, {
        orgId: org.id,
        kind: "payroll",
        title: `Απόδειξη αποδοχών ${item.employeeName} ${month}`,
        period: month,
        fileName: payslipFilename(month, item.employeeName),
        mimeType: "application/pdf",
        bytes: buffer,
        userId: user.id,
        userName: signer?.name ?? user.name ?? user.email,
      });
      const stamped = await renderPayslipPdf({
        org,
        data: {
          month: label,
          employeeName: item.employeeName,
          afm: emp?.afm ?? "",
          amka: emp?.amka ?? "",
          specialty: emp?.specialtyName ?? "",
          days: item.days,
          gross: item.gross,
          overtimeAmount: item.overtimeAmount,
          bonus: item.bonus,
          efkaEmployee: item.efkaEmployee,
          efkaEmployer: item.efkaEmployer,
          tax: item.tax,
          net: item.net,
        },
        signer: signer ? { ...signer, code: reg.code, verifyUrl: `${base}/verify/${reg.code}` } : undefined,
      });
      return new Response(new Uint8Array(stamped), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition(payslipFilename(month, item.employeeName)), "X-Document-Code": reg.code },
      });
    }

    const file =
      kind === "apd"
        ? await apdFile(db, org, month)
        : kind === "fmy"
          ? await fmyFile(db, org, month)
          : await erganiFile(db, org, (kind.toUpperCase() as "E12" | "E4" | "E3" | "E8") ?? "E12", month);

    const buffer = Buffer.from(file.content, "utf8");
    const reg = await registerDocument(db, {
      orgId: org.id,
      kind: kind === "apd" ? "apd" : kind === "fmy" ? "fmy" : "ergani",
      title: kind === "apd" ? `ΑΠΔ ΕΦΚΑ ${month}` : kind === "fmy" ? `ΦΜΥ ${month}` : `ΕΡΓΑΝΗ ${kind.toUpperCase()} ${month}`,
      period: month,
      fileName: file.fileName,
      mimeType: kind === "fmy" ? "text/csv; charset=utf-8" : kind === "apd" ? "text/plain; charset=utf-8" : "application/xml",
      bytes: buffer,
      userId: user.id,
      userName: signer?.name ?? user.name ?? user.email,
    });
    return new Response(file.content, {
      headers: {
        "Content-Type": kind === "fmy" ? "text/csv; charset=utf-8" : kind === "apd" ? "text/plain; charset=utf-8" : "application/xml; charset=utf-8",
        "Content-Disposition": disposition(file.fileName),
        "X-Document-Code": reg.code,
      },
    });
  } catch (err) {
    return new Response((err as Error).message, { status: 400 });
  }
}
