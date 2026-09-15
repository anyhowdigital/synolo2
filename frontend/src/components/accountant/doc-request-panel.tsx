"use client";

import { useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/page-header";
import { FilterBar } from "@/components/list/filter-bar";
import { ListPagination } from "@/components/list/list-pagination";
import { hrefWith, paginate, parsePage, parsePageSize } from "@/lib/list-params";
import { Copy, FilePlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { closeDocRequestAction, createDocRequestAction } from "@/app/actions/periods";

interface Req {
  id: string;
  token: string;
  title: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  items: { label: string; uploaded: boolean }[];
}

export function DocRequestPanel({ requests }: { requests: Req[] }) {
  const [title, setTitle] = useState("Δικαιολογητικά μήνα");
  const [items, setItems] = useState("Τραπεζικά extraits\nΤιμολόγια αγορών\nΑποδείξεις εξόδων");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<string | null>(null);
  const sp = useSearchParams();
  const path = usePathname();
  const q = (sp.get("q") ?? "").trim();
  const status = sp.get("status") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const pageSize = parsePageSize(sp.get("pageSize"));
  const linkFor = (patch: Record<string, string | number | undefined>) => hrefWith(path, { q, status, from, to, pageSize }, patch);
  const now = new Date().toISOString();
  const requestStatus = (r: Req) => r.status === "closed" ? "closed" : r.expiresAt < now ? "expired" : r.items.every((i) => i.uploaded) ? "complete" : "open";
  const filtered = requests.filter((r) => (!q || `${r.title} ${r.items.map((i) => i.label).join(" ")}`.toLocaleLowerCase("el-GR").includes(q.toLocaleLowerCase("el-GR"))) && (!status || requestStatus(r) === status)
    && (!from || r.createdAt.slice(0, 10) >= from) && (!to || r.createdAt.slice(0, 10) <= to));
  const paged = paginate(filtered, parsePage(sp.get("page")), pageSize);

  const absolute = (token: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/upload/${token}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Νέο αίτημα</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="dr-title">Τίτλος</Label>
            <Input id="dr-title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="doc-title-input" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dr-items">Τι ζητάτε (ένα ανά γραμμή)</Label>
            <Textarea id="dr-items" rows={5} value={items} onChange={(e) => setItems(e.target.value)} data-testid="doc-items-input" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dr-msg">Μήνυμα (προαιρετικό)</Label>
            <Textarea id="dr-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} data-testid="doc-message-input" />
          </div>
          <Button
            className="w-full"
            disabled={pending}
            data-testid="doc-create-btn"
            onClick={() =>
              start(async () => {
                const res = await createDocRequestAction(title, items.split("\n"), message);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                setCreated(res.token);
                toast.success("Το link δημιουργήθηκε – αντιγράψτε το και στείλτε το στον πελάτη.");
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <FilePlus2 data-icon="inline-start" />}
            Δημιουργία link
          </Button>
          {created ? (
            <div className="rounded-md border bg-muted/50 p-2 text-xs break-all" data-testid="doc-created-link">
              {absolute(created)}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="min-w-0">
      <FilterBar action={path} q={q} from={from} to={to} searchPlaceholder="Αναζήτηση αιτήματος, δικαιολογητικού…"
        hidden={{ status, pageSize: String(pageSize) }} filtersActive={!!status} clearHref={linkFor({ q: "", status: "", from: "", to: "" })}
        chips={[{ key: "all", label: "Όλα", value: "" }, { key: "open", label: "Σε εξέλιξη", value: "open" }, { key: "complete", label: "Ολοκληρωμένα", value: "complete" }, { key: "expired", label: "Έληξαν", value: "expired" }, { key: "closed", label: "Κλειστά", value: "closed" }].map((s) => ({ ...s, href: linkFor({ status: s.value }), active: status === s.value }))} />
      <p className="mb-3 text-xs text-muted-foreground" data-testid="documents-date-hint">Το εύρος ημερομηνιών αφορά τη δημιουργία του αιτήματος.</p>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base" data-testid="doc-request-count">Αιτήματα εγγράφων ({paged.total})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3" data-testid="doc-request-list">
          {paged.total === 0 ? (
            <EmptyState title="Δεν βρέθηκαν αιτήματα" description={q || status || from || to ? "Δοκιμάστε διαφορετικά φίλτρα ή καθαρίστε την αναζήτηση." : "Δημιουργήστε ένα αίτημα για να συγκεντρώσετε τα δικαιολογητικά του πελάτη."} />
          ) : (
            paged.rows.map((r) => {
              const expired = r.expiresAt < new Date().toISOString();
              const done = r.items.filter((i) => i.uploaded).length;
              return (
                <div key={r.id} className="min-w-0 rounded-lg border p-3" data-testid={`doc-request-${r.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {done}/{r.items.length} ανεβασμένα · λήγει {new Date(r.expiresAt).toLocaleDateString("el-GR")}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={r.status === "closed" ? "secondary" : expired ? "destructive" : done === r.items.length ? "secondary" : "outline"}>
                        {r.status === "closed" ? "Κλειστό" : expired ? "Έληξε" : done === r.items.length ? "Ολοκληρώθηκε" : "Σε εξέλιξη"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={`doc-copy-${r.id}`}
                        onClick={() => {
                          navigator.clipboard.writeText(absolute(r.token));
                          toast.success("Το link αντιγράφηκε.");
                        }}
                      >
                        <Copy data-icon="inline-start" /> Link
                      </Button>
                      {r.status !== "closed" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`doc-close-${r.id}`}
                          onClick={() =>
                            start(async () => {
                              const res = await closeDocRequestAction(r.id);
                              if (res.ok) toast.success("Το αίτημα έκλεισε.");
                            })
                          }
                        >
                          Κλείσιμο
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {r.items.map((i) => (
                      <li key={i.label}>
                        {i.uploaded ? "✓" : "•"} {i.label}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
      <ListPagination total={paged.total} page={paged.page} pageSize={pageSize} hrefFor={linkFor} noun="αιτήματα" />
      </div>
    </div>
  );
}
