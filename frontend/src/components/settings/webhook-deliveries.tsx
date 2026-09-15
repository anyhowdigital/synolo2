"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { processQueueAction, retryDeliveryAction } from "@/app/actions/developer";
import type { WebhookDelivery } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS: Record<string, { label: string; variant: "secondary" | "destructive" | "outline" }> = {
  delivered: { label: "Παραδόθηκε", variant: "secondary" },
  pending: { label: "Σε αναμονή", variant: "outline" },
  failed: { label: "Απέτυχε", variant: "destructive" },
};

export function WebhookDeliveriesCard({ deliveries, hookUrls, stats }: { deliveries: WebhookDelivery[]; hookUrls: Record<string, string>; stats: { pending: number; failed: number } }) {
  const [pending, start] = useTransition();
  const retry = (id: string) =>
    start(async () => {
      const res = await retryDeliveryAction(id);
      if (res.ok) toast.success("Το webhook παραδόθηκε.");
      else toast.error(res.error);
    });
  const process = () =>
    start(async () => {
      const res = await processQueueAction();
      if (res.ok) {
        toast.success(`Επεξεργάστηκαν ${res.id} εκκρεμείς παραδόσεις.`);
        if (res.warning) toast.warning(res.warning);
      } else toast.error(res.error);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Ιστορικό παραδόσεων webhooks
          {stats.pending ? <Badge variant="outline">{stats.pending} σε αναμονή</Badge> : null}
          {stats.failed ? <Badge variant="destructive">{stats.failed} απέτυχαν</Badge> : null}
        </CardTitle>
        <CardDescription>
          Κάθε γεγονός μπαίνει σε ουρά και ξαναδοκιμάζεται αυτόματα με εκθετική καθυστέρηση (1&apos;, 5&apos;, 30&apos;, 2h, 12h) μέσω του <code className="rounded bg-muted px-1">/api/cron/webhooks</code>. Μπορείτε να επαναλάβετε χειροκίνητα όσες απέτυχαν.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex justify-end">
          <Button size="sm" variant="outline" disabled={pending || stats.pending === 0} onClick={process}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            Επεξεργασία ουράς τώρα
          </Button>
        </div>
        {deliveries.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Δεν υπάρχουν παραδόσεις ακόμη. Θα εμφανιστούν μόλις εκδοθεί ή διαβιβαστεί παραστατικό ενώ υπάρχει ενεργό webhook.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Πότε</TableHead>
                <TableHead>Γεγονός</TableHead>
                <TableHead className="hidden md:table-cell">Endpoint</TableHead>
                <TableHead>Κατάσταση</TableHead>
                <TableHead className="hidden sm:table-cell">Προσπάθειες</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((d) => {
                const st = STATUS[d.status] ?? STATUS.pending;
                return (
                  <TableRow key={d.id}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(d.createdAt).toLocaleString("el-GR")}</TableCell>
                    <TableCell className="font-mono text-xs">{d.event}</TableCell>
                    <TableCell className="hidden max-w-56 truncate font-mono text-xs text-muted-foreground md:table-cell" title={hookUrls[d.webhookId]}>
                      {hookUrls[d.webhookId] ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                      {d.lastError ? <div className="mt-0.5 max-w-48 truncate text-[11px] text-muted-foreground" title={d.lastError}>{d.lastStatusCode ? `HTTP ${d.lastStatusCode}` : d.lastError}</div> : null}
                    </TableCell>
                    <TableCell className="hidden text-xs sm:table-cell">
                      {d.attempts}
                      {d.status === "pending" && d.attempts > 0 ? <span className="text-muted-foreground"> · επόμενη {new Date(d.nextAttemptAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}</span> : null}
                    </TableCell>
                    <TableCell>
                      {d.status !== "delivered" ? (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => retry(d.id)} title="Επανάληψη τώρα">
                          <RotateCw data-icon="inline-start" /> Επανάληψη
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
