"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteAssetAction, postDepreciationAction, saveAssetAction } from "@/app/actions/payroll";

const eur = (n: number) => `${n.toFixed(2)} €`;

interface AssetRow {
  id: string;
  name: string;
  category: string;
  accountCode: string;
  acquiredAt: string;
  cost: number;
  usefulYears: number;
  monthly: number;
  accumulated: number;
  bookValue: number;
}

export function AssetsPanel({ orgId, month, rows, readOnly }: { orgId: string; month: string; rows: AssetRow[]; readOnly: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", category: "", accountCode: "12", acquiredAt: `${month}-01`, cost: "", salvage: "0", usefulYears: "5" });

  const totals = rows.reduce((a, r) => ({ cost: a.cost + r.cost, monthly: a.monthly + r.monthly, accumulated: a.accumulated + r.accumulated, book: a.book + r.bookValue }), { cost: 0, monthly: 0, accumulated: 0, book: 0 });

  return (
    <div className="space-y-6" data-testid="assets-panel">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Αξία κτήσης", totals.cost],
          ["Απόσβεση μήνα", totals.monthly],
          ["Σωρευμένες αποσβέσεις", totals.accumulated],
          ["Αναπόσβεστη αξία", totals.book],
        ].map(([l, v]) => (
          <Card key={l as string}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{l as string}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{eur(v as number)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await postDepreciationAction(orgId, month);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success(res.message);
                router.refresh();
              })
            }
            data-testid="assets-post-depreciation"
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Wand2 data-icon="inline-start" />} Δημιουργία άρθρων αποσβέσεων {month}
          </Button>
          <form className="ml-auto flex items-end gap-2">
            <input type="month" name="month" defaultValue={month} className="h-9 rounded-md border bg-background px-3 text-sm" data-testid="assets-month" />
            <Button type="submit" variant="secondary" size="sm">
              Μήνας
            </Button>
          </form>
        </div>
      ) : null}

      {!readOnly ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Νέο πάγιο</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["name", "Ονομασία", "text"],
              ["category", "Κατηγορία", "text"],
              ["accountCode", "Λογαριασμός", "text"],
              ["acquiredAt", "Ημ. κτήσης", "date"],
              ["cost", "Αξία κτήσης (€)", "number"],
              ["usefulYears", "Ωφέλιμη ζωή (έτη)", "number"],
            ].map(([key, label, type]) => (
              <div key={key} className="grid gap-1">
                <Label className="text-xs">{label}</Label>
                <Input type={type} step={key === "cost" ? "0.01" : undefined} value={(form as Record<string, string>)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} data-testid={`asset-${key}`} />
              </div>
            ))}
            <div className="flex items-end lg:col-span-6">
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await saveAssetAction(orgId, {
                      name: form.name,
                      category: form.category,
                      accountCode: form.accountCode,
                      acquiredAt: form.acquiredAt,
                      cost: Number(form.cost) || 0,
                      salvage: Number(form.salvage) || 0,
                      usefulYears: Number(form.usefulYears) || 5,
                    });
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("Το πάγιο καταχωρήθηκε.");
                    setForm({ ...form, name: "", cost: "" });
                    router.refresh();
                  })
                }
                data-testid="asset-save"
              >
                {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Plus data-icon="inline-start" />} Προσθήκη παγίου
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Μητρώο παγίων ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table data-testid="assets-table">
            <TableHeader>
              <TableRow>
                <TableHead>Πάγιο</TableHead>
                <TableHead>Λογ.</TableHead>
                <TableHead>Κτήση</TableHead>
                <TableHead className="text-right">Αξία</TableHead>
                <TableHead className="text-right">Έτη</TableHead>
                <TableHead className="text-right">Απόσβεση μήνα</TableHead>
                <TableHead className="text-right">Σωρευμένες</TableHead>
                <TableHead className="text-right">Αναπόσβεστη</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    Δεν έχουν καταχωρηθεί πάγια.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.name}
                      {r.category ? <span className="block text-xs text-muted-foreground">{r.category}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs">{r.accountCode}</TableCell>
                    <TableCell className="text-xs">{r.acquiredAt}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(r.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.usefulYears}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(r.monthly)}</TableCell>
                    <TableCell className="text-right tabular-nums">{eur(r.accumulated)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{eur(r.bookValue)}</TableCell>
                    <TableCell className="text-right">
                      {!readOnly ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              await deleteAssetAction(orgId, r.id);
                              router.refresh();
                            })
                          }
                          data-testid={`asset-delete-${r.id}`}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
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
