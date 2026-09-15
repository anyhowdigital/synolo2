import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft, ChevronRight, FileText, Pencil, Play, Trash2 } from "lucide-react";
import { getDb } from "@/db";
import { projects, customers, projectTasks, timeEntries, projectExpenses, invoices } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { can } from "@/lib/auth/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/invoice/totals";
import { TimerControl } from "@/components/projects/timer-control";
import { ManualTimeForm } from "@/components/projects/manual-time-form";
import { ProjectExpenseForm } from "@/components/projects/project-expense-form";
import { InvoiceUnbilledButton, TaskAddForm, DeleteTimeEntryButton, DeleteProjectExpenseButton, TaskToggleForm } from "@/components/projects/project-actions";

const STATUS_LABEL: Record<string, string> = {
  active: "Ενεργό",
  on_hold: "Σε αναμονή",
  completed: "Ολοκληρωμένο",
  archived: "Αρχείο",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const ctx = await requireContext(db);
  const { org, role, user } = ctx;
  const canWrite = can(role, "write");
  const project = await db.query.projects.findFirst({ where: and(eq(projects.id, id), eq(projects.orgId, org.id)) });
  if (!project) notFound();
  const customer = project.customerId ? await db.query.customers.findFirst({ where: and(eq(customers.id, project.customerId), eq(customers.orgId, org.id)) }) : null;
  const tasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, id)).orderBy(desc(projectTasks.createdAt));
  const entries = await db.select().from(timeEntries).where(eq(timeEntries.projectId, id)).orderBy(desc(timeEntries.startedAt));
  const pExpenses = await db.select().from(projectExpenses).where(eq(projectExpenses.projectId, id)).orderBy(desc(projectExpenses.incurredOn));

  const runningEntry = entries.find((e) => e.status === "running" && e.userId === user.id) ?? null;

  const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0);
  const billableRevenue = entries.filter((e) => e.billable && e.status !== "non_billable").reduce((s, e) => s + (e.hourlyRate * e.minutes) / 60, 0);
  const unbilledMinutes = entries.filter((e) => e.billable && e.status === "logged").reduce((s, e) => s + e.minutes, 0);
  const unbilledRevenue = entries.filter((e) => e.billable && e.status === "logged").reduce((s, e) => s + (e.hourlyRate * e.minutes) / 60, 0);
  const invoicedRevenue = entries.filter((e) => e.status === "invoiced").reduce((s, e) => s + (e.hourlyRate * e.minutes) / 60, 0);
  const totalCost = pExpenses.reduce((s, e) => s + e.amount, 0);
  const billableExpAmount = pExpenses.filter((e) => e.billable && !e.invoiceId).reduce((s, e) => s + e.amount * (1 + (e.markupPercent || 0) / 100), 0);
  const invoicedRelated = await db.select({ id: invoices.id, seriesCode: invoices.seriesCode, number: invoices.number, status: invoices.status, totalGrossValue: invoices.totalGrossValue, issueDate: invoices.issueDate }).from(invoices).where(and(eq(invoices.orgId, org.id))).orderBy(desc(invoices.createdAt));
  const relatedInvoices = new Set([...entries, ...pExpenses].map((x) => (x as any).invoiceId).filter(Boolean));
  const projectInvoices = invoicedRelated.filter((i) => relatedInvoices.has(i.id));

  return (
    <>
      <PageHeader
        title={project.name}
        description={project.description || `${STATUS_LABEL[project.status]}${customer ? ` · ${customer.name}` : ""}`}
      >
        <Button asChild variant="ghost">
          <Link href="/projects"><ArrowLeft className="size-4" /> Επιστροφή</Link>
        </Button>
        {canWrite ? (
          <Button asChild variant="outline">
            <Link href={`/projects/${id}/edit`}><Pencil className="size-4" /> Επεξεργασία</Link>
          </Button>
        ) : null}
        {canWrite ? <InvoiceUnbilledButton projectId={id} disabled={unbilledMinutes === 0 && billableExpAmount < 0.005} unbilledTotal={unbilledRevenue + billableExpAmount} /> : null}
      </PageHeader>

      {/* Stat cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Σύνολο ωρών" value={(totalMinutes / 60).toFixed(2)} sub={project.budgetHours ? `από ${project.budgetHours}` : undefined} />
        <Stat label="Μη χρεωμένα" value={formatMoney(unbilledRevenue + billableExpAmount)} sub={`${(unbilledMinutes / 60).toFixed(2)} ώρες + έξοδα`} accent="amber" />
        <Stat label="Τιμολογημένα" value={formatMoney(invoicedRevenue)} accent="emerald" />
        <Stat label="Κερδοφορία" value={formatMoney(billableRevenue + billableExpAmount - totalCost)} sub={`Έσοδα ${formatMoney(billableRevenue)} − Έξοδα ${formatMoney(totalCost)}`} />
      </div>

      {/* Timer */}
      {canWrite ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Χρονόμετρο</h2>
          <TimerControl projectId={id} tasks={tasks.map((t) => ({ id: t.id, name: t.name }))} runningEntry={runningEntry ? { id: runningEntry.id, startedAt: runningEntry.startedAt, description: runningEntry.description, taskId: runningEntry.taskId } : null} />
        </section>
      ) : null}

      {/* Tasks */}
      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Εργασίες</h2>
        </div>
        <div className="rounded-xl border bg-card p-4">
          {tasks.length === 0 ? <p className="text-sm text-muted-foreground">Δεν υπάρχουν εργασίες. Προσθέστε παρακάτω.</p> : (
            <ul className="divide-y">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <TaskToggleForm id={t.id} projectId={id} done={t.done} name={t.name} rate={t.hourlyRate} />
                </li>
              ))}
            </ul>
          )}
          {canWrite ? <TaskAddForm projectId={id} /> : null}
        </div>
      </section>

      {/* Manual time */}
      {canWrite ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Χειροκίνητη καταχώρηση ωρών</h2>
          <ManualTimeForm projectId={id} tasks={tasks.map((t) => ({ id: t.id, name: t.name }))} defaultRate={project.hourlyRate} />
        </section>
      ) : null}

      {/* Time entries */}
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Καταγραφές χρόνου</h2>
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ημ/νία</TableHead>
                <TableHead>Περιγραφή</TableHead>
                <TableHead>Χρήστης</TableHead>
                <TableHead className="text-right">Ώρες</TableHead>
                <TableHead className="text-right">Αξία</TableHead>
                <TableHead>Κατάσταση</TableHead>
                {canWrite ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Καμία καταχώρηση.</TableCell></TableRow>
              ) : entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{new Date(e.startedAt).toLocaleDateString("el-GR")}</TableCell>
                  <TableCell>{e.description || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-xs">{e.userName}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.status === "running" ? "…" : (e.minutes / 60).toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.billable ? formatMoney((e.hourlyRate * e.minutes) / 60) : "—"}</TableCell>
                  <TableCell>
                    {e.status === "running" ? <Badge className="bg-emerald-100 text-emerald-800">Τρέχει</Badge>
                     : e.status === "invoiced" ? <Badge className="bg-blue-100 text-blue-800">Τιμολογημένο</Badge>
                     : !e.billable ? <Badge variant="outline">Μη χρεώσιμο</Badge>
                     : <Badge variant="outline">Καταχωρημένο</Badge>}
                  </TableCell>
                  {canWrite ? (
                    <TableCell className="text-right">
                      {e.status === "logged" && !e.invoiceId ? <DeleteTimeEntryButton id={e.id} projectId={id} /> : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Expenses */}
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Έξοδα έργου</h2>
        {canWrite ? <ProjectExpenseForm projectId={id} /> : null}
        <div className="mt-3 rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ημ/νία</TableHead>
                <TableHead>Περιγραφή</TableHead>
                <TableHead className="text-right">Ποσό</TableHead>
                <TableHead className="text-right">Χρέωση (+markup)</TableHead>
                <TableHead>Κατάσταση</TableHead>
                {canWrite ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pExpenses.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Κανένα έξοδο.</TableCell></TableRow>
              ) : pExpenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{new Date(e.incurredOn).toLocaleDateString("el-GR")}</TableCell>
                  <TableCell>{e.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(e.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.billable ? formatMoney(e.amount * (1 + (e.markupPercent || 0) / 100)) : "—"}</TableCell>
                  <TableCell>{e.invoiceId ? <Badge className="bg-blue-100 text-blue-800">Τιμολογημένο</Badge> : !e.billable ? <Badge variant="outline">Μη χρεώσιμο</Badge> : <Badge variant="outline">Εκκρεμεί</Badge>}</TableCell>
                  {canWrite ? <TableCell className="text-right">{!e.invoiceId ? <DeleteProjectExpenseButton id={e.id} projectId={id} /> : null}</TableCell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Related invoices */}
      {projectInvoices.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Παραστατικά έργου</h2>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Παραστατικό</TableHead>
                  <TableHead>Ημ/νία</TableHead>
                  <TableHead>Κατάσταση</TableHead>
                  <TableHead className="text-right">Σύνολο</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectInvoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell><FileText className="mr-2 inline size-4" />{i.seriesCode} {i.number}</TableCell>
                    <TableCell className="text-xs">{new Date(i.issueDate).toLocaleDateString("el-GR")}</TableCell>
                    <TableCell><Badge variant="outline">{i.status}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(i.totalGrossValue)}</TableCell>
                    <TableCell className="text-right"><Link href={`/invoices/${i.id}`} className="text-sm underline">Άνοιγμα <ChevronRight className="inline size-3" /></Link></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "amber" | "emerald" }) {
  const cls = accent === "amber" ? "text-amber-700" : accent === "emerald" ? "text-emerald-700" : "";
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${cls}`}>{value}</div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
