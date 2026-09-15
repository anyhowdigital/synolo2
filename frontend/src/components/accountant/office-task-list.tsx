"use client";

import { useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/page-header";
import { FilterBar } from "@/components/list/filter-bar";
import { ListPagination } from "@/components/list/list-pagination";
import { hrefWith, paginate, parsePage, parsePageSize } from "@/lib/list-params";
import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateOfficeTaskAction } from "@/app/actions/office";

interface Item {
  id: string;
  orgId: string;
  orgName: string;
  title: string;
  severity: string;
  status: string;
  dueDate: string | null;
  assigneeUserId: string | null;
  note: string;
}

const SEV: Record<string, { label: string; cls: string }> = {
  critical: { label: "Κρίσιμο", cls: "bg-destructive text-destructive-foreground" },
  high: { label: "Υψηλό", cls: "bg-amber-500 text-white" },
  medium: { label: "Μέτριο", cls: "bg-amber-100 text-amber-900" },
  low: { label: "Χαμηλό", cls: "bg-muted text-muted-foreground" },
};

export function OfficeTaskList({ items, people }: { items: Item[]; people: { id: string; label: string }[] }) {
  const sp = useSearchParams();
  const path = usePathname();
  const q = (sp.get("q") ?? "").trim();
  const filter = sp.get("status") ?? "open";
  const org = sp.get("org") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const pageSize = parsePageSize(sp.get("pageSize"));
  const linkFor = (patch: Record<string, string | number | undefined>) => hrefWith(path, { q, status: filter, org, from, to, pageSize }, patch);
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  const orgs = [...new Map(items.map((i) => [i.orgId, i.orgName])).entries()];
  const filtered = items.filter((i) => (filter === "all" || (filter === "overdue" ? i.status === "open" && !!i.dueDate && i.dueDate < today : filter === "open" ? i.status === "open" : i.status !== "open"))
    && (!org || i.orgId === org) && (!from || (!!i.dueDate && i.dueDate >= from)) && (!to || (!!i.dueDate && i.dueDate <= to))
    && (!q || `${i.title} ${i.orgName} ${i.note} ${people.find((p) => p.id === i.assigneeUserId)?.label ?? ""}`.toLocaleLowerCase("el-GR").includes(q.toLocaleLowerCase("el-GR"))));
  const paged = paginate(filtered, parsePage(sp.get("page")), pageSize);

  const update = (id: string, patch: Parameters<typeof updateOfficeTaskAction>[1], msg: string) =>
    start(async () => {
      const res = await updateOfficeTaskAction(id, patch);
      if (res.ok) toast.success(msg);
      else toast.error(res.error);
    });

  return (
    <div className="min-w-0">
      <FilterBar key={org} action={path} q={q} from={from} to={to} searchPlaceholder="Αναζήτηση εργασίας, πελάτη, ανάθεσης…"
        hidden={{ status: filter, pageSize: String(pageSize) }} filtersActive={!!org || filter !== "open"} clearHref={linkFor({ q: "", org: "", status: "open", from: "", to: "" })}
        chips={[{ key: "open", label: "Ανοιχτές" }, { key: "done", label: "Ολοκληρωμένες" }, { key: "overdue", label: "Εκπρόθεσμες" }, { key: "all", label: "Όλες" }].map((s) => ({ ...s, href: linkFor({ status: s.key }), active: filter === s.key }))}>
        <select name="org" defaultValue={org} aria-label="Πελάτης" className="h-8 min-w-0 max-w-full rounded-md border bg-background px-2 text-sm" data-testid="task-org-filter">
          <option value="">Όλες οι επιχειρήσεις</option>
          {orgs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </FilterBar>
      <p className="mb-3 text-xs text-muted-foreground" data-testid="tasks-date-hint">Το εύρος ημερομηνιών αφορά την προθεσμία της εργασίας.</p>
    <Card data-testid="office-task-list">
      <CardContent className="space-y-3 p-4">
        {paged.total === 0 ? (
          <EmptyState title="Δεν βρέθηκαν εκκρεμότητες" description={q || org || from || to || filter !== "open" ? "Δοκιμάστε διαφορετικά φίλτρα ή καθαρίστε την αναζήτηση." : "Δημιουργήστε τις από το Cockpit → «Δημιουργία εκκρεμοτήτων»."} />
        ) : (
          paged.rows.map((t) => {
            const overdue = t.status === "open" && t.dueDate && t.dueDate < today;
            return (
              <div key={t.id} className={`min-w-0 space-y-2 rounded-lg border p-3 ${overdue ? "border-destructive/50 bg-destructive/5" : ""}`} data-testid={`task-${t.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={SEV[t.severity]?.cls ?? SEV.medium.cls}>{SEV[t.severity]?.label ?? t.severity}</Badge>
                      <Link href={`/office/clients/${t.orgId}`} className="break-all text-sm font-medium underline-offset-2 hover:underline" data-testid={`task-client-${t.id}`}>
                        {t.orgName}
                      </Link>
                      {t.status !== "open" ? <Badge variant="secondary">Ολοκληρώθηκε</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm break-words">{t.title}</p>
                  </div>
                  {t.status === "open" ? (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => update(t.id, { status: "done" }, "Η εκκρεμότητα ολοκληρώθηκε.")} data-testid={`task-done-${t.id}`}>
                      <CheckCircle2 data-icon="inline-start" /> Ολοκληρώθηκε
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={pending} data-testid={`task-reopen-${t.id}`} onClick={() => update(t.id, { status: "open" }, "Επαναφέρθηκε σε ανοιχτή.")}>
                      Επαναφορά
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Clock className="size-3.5" /> Προθεσμία
                  </span>
                  <Input
                    type="date"
                    defaultValue={t.dueDate ?? ""}
                    className="h-8 w-40"
                    data-testid={`task-due-${t.id}`}
                    onBlur={(e) => e.target.value !== (t.dueDate ?? "") && update(t.id, { dueDate: e.target.value || null }, "Η προθεσμία ενημερώθηκε.")}
                  />
                  <select
                    defaultValue={t.assigneeUserId ?? ""}
                    className="h-8 min-w-0 max-w-full rounded-md border bg-transparent px-2"
                    data-testid={`task-assignee-${t.id}`}
                    onChange={(e) => update(t.id, { assigneeUserId: e.target.value || null }, "Η ανάθεση ενημερώθηκε.")}
                  >
                    <option value="">Χωρίς ανάθεση</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {overdue ? <span className="text-destructive">Εκπρόθεσμη</span> : null}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
      <ListPagination total={paged.total} page={paged.page} pageSize={pageSize} hrefFor={linkFor} noun="εκκρεμότητες" />
    </div>
  );
}
