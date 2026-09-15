import type { F2Result } from "@/lib/greek/f2";
import { formatDate, formatMoney } from "@/lib/invoice/totals";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const TOTALS = new Set(["307", "312", "337", "367", "387", "470", "480", "483", "484"]);

function Section({ title, codes }: { title: string; codes: F2Result["codes"] }) {
  const visible = codes.filter((c) => c.amount !== 0 || TOTALS.has(c.code));
  if (visible.length === 0) return null;
  return (
    <div className="min-w-0">
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Κωδ.</TableHead>
            <TableHead>Περιγραφή</TableHead>
            <TableHead className="text-right">Ποσό</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((c) => (
            <TableRow key={c.code} className={cn(TOTALS.has(c.code) && "bg-muted/50 font-medium")}>
              <TableCell className="font-mono text-xs">{c.code}</TableCell>
              <TableCell className="whitespace-normal text-xs sm:text-sm">{c.label}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(c.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function F2Card({ f2, period }: { f2: F2Result & { invoiceCount: number; expenseCount: number }; period: { from: string; to: string } }) {
  const by = (g: F2Result["codes"][number]["group"]) => f2.codes.filter((c) => c.group === g);
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Φ2 – Περιοδική δήλωση ΦΠΑ (προσυμπλήρωση)</CardTitle>
        <CardDescription>
          Κωδικοί εντύπου Φ2 από {f2.invoiceCount} παραστατικά εσόδων και {f2.expenseCount} παραστατικά εξόδων της περιόδου {formatDate(period.from)} – {formatDate(period.to)}. Ενδεικτικά ποσά – οριστικοποίηση από τον λογιστή (διακανονισμοί, αναλογικός επιμερισμός, πιστωτικό υπόλοιπο προηγούμενης περιόδου).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2 lg:[&>*]:min-w-0">
        <div className="grid min-w-0 gap-4">
          <Section title="Εκροές – φορολογητέα αξία" codes={by("outputs")} />
          <Section title="ΦΠΑ εκροών" codes={by("outputs_vat")} />
        </div>
        <div className="grid min-w-0 gap-4">
          <Section title="Εισροές – φορολογητέα αξία" codes={by("inputs")} />
          <Section title="ΦΠΑ εισροών" codes={by("inputs_vat")} />
        </div>
        <div className="lg:col-span-2">
          <Section title="Εκκαθάριση" codes={by("settlement")} />
        </div>
      </CardContent>
    </Card>
  );
}
