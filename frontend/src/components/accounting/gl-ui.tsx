"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { closeYearAction, createEntryAction, deleteEntryAction, enableDoubleEntryAction, generateEntriesAction } from "@/app/actions/gl";

export function EnableDoubleEntry() {
  const router = useRouter();
  const [plan, setPlan] = useState<"elp" | "egls">("elp");
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ενεργοποίηση διπλογραφικών</CardTitle>
        <CardDescription>Επιλέξτε λογιστικό σχέδιο. Θα δημιουργηθεί το πρότυπο σχέδιο λογαριασμών και θα μπορείτε να παράγετε άρθρα από τα παραστατικά.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground">Λογιστικό σχέδιο</label>
          <Select value={plan} onValueChange={(v) => setPlan(v as "elp" | "egls")}>
            <SelectTrigger className="w-64" data-testid="gl-plan-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="elp">ΕΛΠ (Ν.4308/2014)</SelectItem>
              <SelectItem value="egls">ΕΓΛΣ (Π.Δ.1123/1980)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await enableDoubleEntryAction(plan);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success(`Ενεργοποιήθηκαν τα διπλογραφικά · ${res.created} λογαριασμοί`);
              router.refresh();
            })
          }
          data-testid="gl-enable"
        >
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null} Ενεργοποίηση
        </Button>
      </CardContent>
    </Card>
  );
}

export function GlToolbar({ from, to, year }: { from: string; to: string; year: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await generateEntriesAction(from, to);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success(res.created ? `${res.created} άρθρα δημιουργήθηκαν` : "Δεν βρέθηκαν νέα παραστατικά για άρθρα");
            router.refresh();
          })
        }
        data-testid="gl-generate"
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Wand2 data-icon="inline-start" />} Δημιουργία άρθρων από παραστατικά
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await closeYearAction(year);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success(`Κλείσιμο χρήσης ${year}: αποτέλεσμα ${res.profit} €`);
            router.refresh();
          })
        }
        data-testid="gl-close-year"
      >
        Κλείσιμο χρήσης {year}
      </Button>
    </div>
  );
}

export function ManualEntryForm({ accounts }: { accounts: { code: string; name: string }[] }) {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState([
    { accountCode: "", debit: 0, credit: 0 },
    { accountCode: "", debit: 0, credit: 0 },
  ]);
  const [pending, start] = useTransition();
  const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

  const set = (i: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Νέο χειροκίνητο άρθρο</CardTitle>
        <CardDescription>Χρέωση και πίστωση πρέπει να ισοσκελίζουν. Χρησιμοποιείται για μισθοδοσία, αποσβέσεις, τακτοποιήσεις.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" data-testid="gl-entry-date" />
          <Input placeholder="Αιτιολογία" value={description} onChange={(e) => setDescription(e.target.value)} className="min-w-56 flex-1" data-testid="gl-entry-description" />
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select value={l.accountCode} onValueChange={(v) => set(i, { accountCode: v })}>
                <SelectTrigger className="w-72" data-testid={`gl-line-account-${i}`}>
                  <SelectValue placeholder="Λογαριασμός" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.code} · {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" step="0.01" placeholder="Χρέωση" value={l.debit || ""} onChange={(e) => set(i, { debit: Number(e.target.value) || 0 })} className="w-32" data-testid={`gl-line-debit-${i}`} />
              <Input type="number" step="0.01" placeholder="Πίστωση" value={l.credit || ""} onChange={(e) => set(i, { credit: Number(e.target.value) || 0 })} className="w-32" data-testid={`gl-line-credit-${i}`} />
              {lines.length > 2 ? (
                <Button variant="ghost" size="icon-sm" aria-label="Αφαίρεση" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { accountCode: "", debit: 0, credit: 0 }])} data-testid="gl-add-line">
            <Plus data-icon="inline-start" /> Γραμμή
          </Button>
          <span className={Math.abs(debit - credit) > 0.01 ? "text-destructive" : "text-muted-foreground"} data-testid="gl-entry-totals">
            Χρέωση {debit.toFixed(2)} € · Πίστωση {credit.toFixed(2)} €
          </span>
          <Button
            disabled={pending || Math.abs(debit - credit) > 0.01 || !description.trim()}
            onClick={() =>
              start(async () => {
                const res = await createEntryAction({ date, description, lines: lines.map((l) => ({ ...l, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })) });
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Το άρθρο καταχωρήθηκε.");
                setLines([
                  { accountCode: "", debit: 0, credit: 0 },
                  { accountCode: "", debit: 0, credit: 0 },
                ]);
                setDescription("");
                router.refresh();
              })
            }
            data-testid="gl-entry-save"
          >
            Καταχώρηση
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DeleteEntryButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Διαγραφή άρθρου"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await deleteEntryAction(id);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Το άρθρο διαγράφηκε.");
          router.refresh();
        })
      }
      data-testid={`gl-delete-${id}`}
    >
      <Trash2 />
    </Button>
  );
}
