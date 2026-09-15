"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/invoice/totals";
import { ACCESS_LEVELS, type AccessLevel } from "@/lib/services/firm";
import { officeBulkReconcileAction } from "@/app/actions/bank-ai";

type Row = {
  orgId: string;
  name: string;
  afm: string;
  accounts: number;
  unmatched: number;
  inflow: number;
  outflow: number;
  oldest: string | null;
  accessLevel: AccessLevel;
};

export function OfficeBankingTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const totalUnmatched = rows.reduce((s, r) => s + r.unmatched, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Συμφωνία τραπέζης πελατών</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} πελάτες · {totalUnmatched} ασυμφώνητες κινήσεις συνολικά. Η μαζική συμφωνία εφαρμόζει πρώτα τους κανόνες και μετά την αυτόματη ταύτιση.
          </p>
        </div>
        <Button
          disabled={pending || selected.length === 0}
          data-testid="office-bulk-reconcile"
          onClick={() =>
            start(async () => {
              const res = await officeBulkReconcileAction(selected);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success(res.rows.map((r) => `${r.orgName}: ${r.message}`).join(" · ") || "Δεν υπήρχαν κινήσεις προς συμφωνία.");
              setSelected([]);
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
          Αυτόματη συμφωνία επιλεγμένων
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Κατάσταση ανά πελάτη</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table data-testid="office-banking-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Πελάτης</TableHead>
                <TableHead className="text-center">Λογαριασμοί</TableHead>
                <TableHead className="text-center">Ασυμφώνητες</TableHead>
                <TableHead className="text-right">Εισροές</TableHead>
                <TableHead className="text-right">Εκροές</TableHead>
                <TableHead className="text-center">Παλαιότερη</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Δεν υπάρχουν συνεργαζόμενες επιχειρήσεις.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.orgId} data-testid={`office-bank-row-${r.orgId}`}>
                    <TableCell>
                      <Checkbox checked={selected.includes(r.orgId)} onCheckedChange={() => toggle(r.orgId)} disabled={r.accessLevel !== "full" && r.accessLevel !== "manager"} data-testid={`office-bank-select-${r.orgId}`} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/office/clients/${r.orgId}`} className="font-medium underline-offset-2 hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        ΑΦΜ {r.afm} · {ACCESS_LEVELS[r.accessLevel]?.label}
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{r.accounts}</TableCell>
                    <TableCell className="text-center">{r.unmatched ? <Badge variant="destructive">{r.unmatched}</Badge> : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.inflow ? formatMoney(r.inflow) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.outflow ? formatMoney(r.outflow) : "—"}</TableCell>
                    <TableCell className="text-center text-xs tabular-nums text-muted-foreground">{r.oldest ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/office/clients/${r.orgId}`}>Καρτέλα →</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
