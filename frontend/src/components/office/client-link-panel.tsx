"use client";

import { useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/page-header";
import { FilterBar } from "@/components/list/filter-bar";
import { ListPagination } from "@/components/list/list-pagination";
import { hrefWith, paginate, parsePage, parsePageSize } from "@/lib/list-params";
import Link from "next/link";
import { Loader2, UserPlus, KeyRound, Link2Off, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { requestFirmLinkAction } from "@/app/actions/accountant";
import { linkByCodeAction, respondOrgInviteAction, firmUnlinkAction, assignClientAction, cancelFirmRequestAction } from "@/app/actions/firm";
import { ACCESS_LEVELS, type AccessLevel, type FirmRole } from "@/lib/services/firm";

type Row = {
  id: string;
  orgId: string;
  name: string;
  afm: string;
  status: string;
  accessLevel: AccessLevel;
  source: string;
  assigneeUserId: string | null;
  createdAt: string;
};
type Invite = { id: string; orgName: string; afm: string; note: string; accessLevel: string; createdAt: string };

const STATUS: Record<string, { label: string; variant: "secondary" | "outline" | "destructive" }> = {
  active: { label: "Ενεργή συνεργασία", variant: "secondary" },
  pending: { label: "Εκκρεμεί έγκριση", variant: "outline" },
  rejected: { label: "Απορρίφθηκε", variant: "destructive" },
};

const SOURCE: Record<string, string> = { code: "μέσω κωδικού", invite: "μέσω πρόσκλησης", afm: "μέσω ΑΦΜ" };

export function ClientLinkPanel({ rows, invites, people, role }: { rows: Row[]; invites: Invite[]; people: { id: string; label: string }[]; role: FirmRole }) {
  const [afm, setAfm] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const manage = role !== "staff";
  const sp = useSearchParams();
  const path = usePathname();
  const q = (sp.get("q") ?? "").trim();
  const status = sp.get("status") ?? "";
  const pageSize = parsePageSize(sp.get("pageSize"));
  const linkFor = (patch: Record<string, string | number | undefined>) => hrefWith(path, { q, status, pageSize }, patch);
  const filtered = rows.filter((r) => (!status || r.status === status) && (!q || `${r.name} ${r.afm} ${people.find((p) => p.id === r.assigneeUserId)?.label ?? ""}`.toLocaleLowerCase("el-GR").includes(q.toLocaleLowerCase("el-GR"))));
  const paged = paginate(filtered, parsePage(sp.get("page")), pageSize);

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader title="Πελάτες γραφείου" description="Τρεις τρόποι σύνδεσης: κωδικός 6 ψηφίων (άμεσα), αίτημα με ΑΦΜ (με έγκριση), ή πρόσκληση από την επιχείρηση." />

      {invites.length ? (
        <Card className="border-amber-300" data-testid="org-invites-card">
          <CardHeader>
            <CardTitle className="text-base">Προσκλήσεις από επιχειρήσεις ({invites.length})</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0" data-testid={`org-invite-${i.id}`}>
                <div className="min-w-0 text-sm">
                  <div className="font-medium">{i.orgName}</div>
                  <div className="text-xs text-muted-foreground">
                    ΑΦΜ {i.afm} · {ACCESS_LEVELS[(i.accessLevel as AccessLevel) ?? "full"].label}
                    {i.note ? ` · ${i.note}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    data-testid={`org-invite-accept-${i.id}`}
                    onClick={() =>
                      start(async () => {
                        const res = await respondOrgInviteAction(i.id, true);
                        res.ok ? toast.success(`Η συνεργασία με «${i.orgName}» ενεργοποιήθηκε.`) : toast.error(res.error);
                      })
                    }
                  >
                    Αποδοχή
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    data-testid={`org-invite-decline-${i.id}`}
                    onClick={() =>
                      start(async () => {
                        const res = await respondOrgInviteAction(i.id, false);
                        res.ok ? toast.success("Η πρόσκληση απορρίφθηκε.") : toast.error(res.error);
                      })
                    }
                  >
                    Απόρριψη
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {manage ? (
        <Tabs defaultValue="code">
          <TabsList className="h-auto max-w-full flex-wrap justify-start gap-1 group-data-horizontal/tabs:h-auto">
            <TabsTrigger value="code" data-testid="tab-code">
              Κωδικός σύνδεσης
            </TabsTrigger>
            <TabsTrigger value="afm" data-testid="tab-afm">
              Αίτημα με ΑΦΜ
            </TabsTrigger>
            <TabsTrigger value="how" data-testid="tab-how">
              Πώς γίνεται η σύνδεση
            </TabsTrigger>
          </TabsList>

          <TabsContent value="code">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Σύνδεση με κωδικό της επιχείρησης</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-[220px_auto] sm:items-end">
                <div className="space-y-1">
                  <Label htmlFor="link-code">6ψήφιος κωδικός</Label>
                  <Input id="link-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" data-testid="link-code-input" />
                </div>
                <Button
                  disabled={pending || code.replace(/\D/g, "").length !== 6}
                  data-testid="link-code-submit"
                  onClick={() =>
                    start(async () => {
                      const res = await linkByCodeAction(code);
                      if (!res.ok) { toast.error(res.error); return; }
                      setCode("");
                      toast.success(`Συνδεθήκατε με «${res.orgName}».`);
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <KeyRound data-icon="inline-start" />}
                  Σύνδεση τώρα
                </Button>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Ο πελάτης παράγει τον κωδικό από: Ρυθμίσεις → Λογιστής → «Κωδικός σύνδεσης». Ισχύει 7 ημέρες και χρησιμοποιείται μία φορά. Η σύνδεση γίνεται άμεσα.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="afm">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Νέο αίτημα συνεργασίας με ΑΦΜ</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label htmlFor="link-afm">ΑΦΜ επιχείρησης</Label>
                  <Input id="link-afm" value={afm} onChange={(e) => setAfm(e.target.value)} placeholder="099936189" data-testid="link-afm-input" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="link-note">Σημείωση (προαιρετικά)</Label>
                  <Input id="link-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ανάληψη λογιστικής υποστήριξης" data-testid="link-note-input" />
                </div>
                <Button
                  disabled={pending || !afm.trim()}
                  data-testid="link-submit-btn"
                  onClick={() =>
                    start(async () => {
                      const res = await requestFirmLinkAction(afm, note);
                      if (!res.ok) { toast.error(res.error); return; }
                      setAfm("");
                      setNote("");
                      toast.success("Το αίτημα στάλθηκε. Θα ενεργοποιηθεί μόλις το εγκρίνει ο ιδιοκτήτης.");
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <UserPlus data-icon="inline-start" />}
                  Αποστολή αιτήματος
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="how">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <HelpCircle className="size-4" /> Πώς «παντρεύεται» το γραφείο με μια επιχείρηση
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm" data-testid="how-to-link">
                <div>
                  <div className="font-medium">1. Κωδικός σύνδεσης (γρηγορότερο)</div>
                  <p className="text-muted-foreground">
                    Ο πελάτης πηγαίνει Ρυθμίσεις → Λογιστής και πατά «Δημιουργία κωδικού». Σας τον στέλνει και τον καταχωρείτε εδώ. Η πρόσβαση ενεργοποιείται αμέσως, ο κωδικός καταναλώνεται.
                  </p>
                </div>
                <div>
                  <div className="font-medium">2. Αίτημα με ΑΦΜ</div>
                  <p className="text-muted-foreground">Στέλνετε αίτημα με το ΑΦΜ. Ο ιδιοκτήτης το εγκρίνει από τις Ρυθμίσεις του. Χωρίς έγκριση δεν βλέπετε κανένα στοιχείο.</p>
                </div>
                <div>
                  <div className="font-medium">3. Πρόσκληση από την επιχείρηση</div>
                  <p className="text-muted-foreground">Ο πελάτης στέλνει πρόσκληση στο email του γραφείου. Εμφανίζεται εδώ πάνω και την αποδέχεστε με ένα κλικ.</p>
                </div>
                <div>
                  <div className="font-medium">Επίπεδα πρόσβασης</div>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {Object.entries(ACCESS_LEVELS).map(([key, v]) => (
                      <li key={key}>
                        · <strong>{v.label}</strong>: {v.hint}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted-foreground">Το επίπεδο το ορίζει πάντα η επιχείρηση. Η διακοπή συνεργασίας γίνεται από όποια πλευρά θέλει και καταγράφεται στο ιστορικό.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : null}

      <div>
      <FilterBar action={path} q={q} showDates={false} searchPlaceholder="Αναζήτηση επωνυμίας, ΑΦΜ, υπευθύνου…"
        hidden={{ status, pageSize: String(pageSize) }} filtersActive={!!status} clearHref={linkFor({ q: "", status: "" })}
        chips={[{ key: "all", label: "Όλες", href: linkFor({ status: "" }), active: !status }, ...Object.entries(STATUS).map(([key, value]) => ({ key, label: value.label, href: linkFor({ status: key }), active: status === key }))]} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base" data-testid="client-link-count">Συνεργασίες ({paged.total})</CardTitle>
        </CardHeader>
        <CardContent className="divide-y" data-testid="client-link-list">
          {paged.total === 0 ? (
            <EmptyState title={q || status ? "Δεν βρέθηκαν συνεργασίες" : "Δεν υπάρχουν συνεργασίες ακόμη"} description={q || status ? "Δοκιμάστε διαφορετικά φίλτρα ή καθαρίστε την αναζήτηση." : "Συνδέστε μια επιχείρηση με έναν από τους παραπάνω τρόπους."} />
          ) : (
            paged.rows.map((r) => {
              const s = STATUS[r.status] ?? STATUS.pending;
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0" data-testid={`client-link-${r.id}`}>
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {r.status === "active" ? (
                        <Link href={`/office/clients/${r.orgId}`} className="underline-offset-2 hover:underline" data-testid={`client-open-${r.orgId}`}>
                          {r.name}
                        </Link>
                      ) : (
                        r.name
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ΑΦΜ {r.afm} · {SOURCE[r.source] ?? "μέσω ΑΦΜ"} · {new Date(r.createdAt).toLocaleDateString("el-GR")}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={s.variant}>{s.label}</Badge>
                    {r.status === "active" ? <Badge variant="outline">{ACCESS_LEVELS[r.accessLevel]?.label ?? r.accessLevel}</Badge> : null}
                    {manage && r.status === "active" ? (
                      <Select
                        value={r.assigneeUserId ?? "none"}
                        onValueChange={(v) =>
                          start(async () => {
                            const res = await assignClientAction(r.id, v === "none" ? null : v);
                            res.ok ? toast.success("Η ανάθεση αποθηκεύτηκε.") : toast.error(res.error);
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-[190px] text-xs" data-testid={`assign-${r.id}`}>
                          <SelectValue placeholder="Υπεύθυνος" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Χωρίς υπεύθυνο</SelectItem>
                          {people.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    {manage ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        data-testid={`unlink-${r.id}`}
                        onClick={() =>
                          start(async () => {
                            const res = r.status === "pending" ? await cancelFirmRequestAction(r.id) : await firmUnlinkAction(r.id);
                            res.ok ? toast.success(r.status === "pending" ? "Το αίτημα ακυρώθηκε." : "Η συνεργασία διακόπηκε.") : toast.error(res.error);
                          })
                        }
                      >
                        <Link2Off data-icon="inline-start" />
                        {r.status === "pending" ? "Ακύρωση" : "Διακοπή"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
      <ListPagination total={paged.total} page={paged.page} pageSize={pageSize} hrefFor={linkFor} noun="συνεργασίες" />
      </div>
    </div>
  );
}
