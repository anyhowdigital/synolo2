"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/invoice/totals";
import { bulkTransmitAction, bulkBooksCsvAction } from "@/app/actions/office";
import { ACCESS_LEVELS, type AccessLevel } from "@/lib/services/firm";

type Row = {
  orgId: string;
  name: string;
  afm: string;
  outputVat: number;
  inputVat: number;
  payable: number;
  credit: number;
  booksVat: number;
  invoiceCount: number;
  pendingMydata: number;
  locked: boolean;
  accessLevel: AccessLevel;
};

export function VatComplianceTable({ month, rows }: { month: string; rows: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const totals = rows.reduce((acc, r) => ({ payable: acc.payable + r.payable, credit: acc.credit + r.credit, pending: acc.pending + r.pendingMydata }), { payable: 0, credit: 0, pending: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Συμμόρφωση ΦΠΑ & myDATA</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} πελάτες · οφειλή ΦΠΑ {formatMoney(totals.payable)} · πιστωτικό {formatMoney(totals.credit)} · {totals.pending} εκκρεμή myDATA
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="month"
            defaultValue={month}
            className="h-9 w-[160px]"
            data-testid="vat-month-input"
            onChange={(e) => e.target.value && router.push(`/office/vat?month=${e.target.value}`)}
          />
          <Button
            size="sm"
            disabled={pending || !selected.length}
            data-testid="vat-bulk-transmit"
            onClick={() =>
              start(async () => {
                const res = await bulkTransmitAction(selected);
                if (!res.ok) { toast.error(res.error); return; }
                toast.success(res.rows.map((r) => `${r.orgName}: ${r.message}`).join(" · "));
                router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
            Μαζική διαβίβαση
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !selected.length}
            data-testid="vat-bulk-export"
            onClick={() =>
              start(async () => {
                const res = await bulkBooksCsvAction(selected);
                if (!res.ok) { toast.error(res.error); return; }
                const url = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = `vivlia-${month}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success(`${res.rows} γραμμές εξήχθησαν.`);
              })
            }
          >
            <Download data-icon="inline-start" />
            Εξαγωγή βιβλίων
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Πίνακας μήνα {month}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table data-testid="vat-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Πελάτης</TableHead>
                <TableHead className="text-right">ΦΠΑ εκροών</TableHead>
                <TableHead className="text-right">ΦΠΑ εισροών</TableHead>
                <TableHead className="text-right">Χρεωστικό</TableHead>
                <TableHead className="text-right">Πιστωτικό</TableHead>
                <TableHead className="text-center">Παραστ.</TableHead>
                <TableHead className="text-center">myDATA</TableHead>
                <TableHead className="text-center">Περίοδος</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    Δεν υπάρχουν συνεργαζόμενες επιχειρήσεις.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.orgId} data-testid={`vat-row-${r.orgId}`}>
                    <TableCell>
                      <Checkbox checked={selected.includes(r.orgId)} onCheckedChange={() => toggle(r.orgId)} data-testid={`vat-select-${r.orgId}`} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/office/clients/${r.orgId}`} className="font-medium underline-offset-2 hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        ΑΦΜ {r.afm} · {ACCESS_LEVELS[r.accessLevel]?.label}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.outputVat)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.inputVat)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.payable ? formatMoney(r.payable) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.credit ? formatMoney(r.credit) : "—"}</TableCell>
                    <TableCell className="text-center tabular-nums">{r.invoiceCount}</TableCell>
                    <TableCell className="text-center">{r.pendingMydata ? <Badge variant="destructive">{r.pendingMydata}</Badge> : "—"}</TableCell>
                    <TableCell className="text-center">{r.locked ? <Badge variant="secondary">κλειδωμένη</Badge> : <Badge variant="outline">ανοιχτή</Badge>}</TableCell>
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
      <p className="text-xs text-muted-foreground">
        Οι τιμές προέρχονται από τα βιβλία (Φ2 προσυμπλήρωση). Διαφορές μεταξύ βιβλίων και myDATA εμφανίζονται στην αναφορά Φ2 της κάθε επιχείρησης.
      </p>
    </div>
  );
}
