import Link from "next/link";
import { AlertTriangle, Radar, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrgWatch } from "@/lib/services/org-watch";

const LEVEL: Record<OrgWatch["level"], { label: string; cls: string }> = {
  red: { label: "Υψηλός κίνδυνος", cls: "border-destructive/50 bg-destructive/5" },
  amber: { label: "Χρειάζεται προσοχή", cls: "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20" },
  green: { label: "Εντάξει", cls: "" },
};

/** Early-warning λίστα: ποια επιχείρηση θα δημιουργήσει πρόβλημα αυτόν τον μήνα. */
export function EarlyWarningPanel({ watches }: { watches: OrgWatch[] }) {
  const attention = watches.filter((w) => w.level !== "green" || w.anomalies.length > 0);
  return (
    <Card className="mb-6" data-testid="early-warning-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radar className="size-5" /> Έγκαιρη προειδοποίηση
        </CardTitle>
        <CardDescription>
          {attention.length === 0
            ? "Καμία επιχείρηση δεν εμφανίζει κίνδυνο ή στατιστική ανωμαλία."
            : `${attention.length} από ${watches.length} επιχειρήσεις χρειάζονται προσοχή – ταξινομημένες κατά προτεραιότητα εργασίας.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {watches.map((w) => (
          <div key={w.orgId} className={`min-w-0 rounded-xl border p-4 ${LEVEL[w.level].cls}`} data-testid={`watch-${w.orgId}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{w.orgName}</span>
                  <Badge variant={w.level === "red" ? "destructive" : w.level === "amber" ? "outline" : "secondary"} className="text-xs">
                    {LEVEL[w.level].label} · {w.score}/100
                  </Badge>
                  {w.trend !== 0 ? (
                    <span className={`inline-flex items-center gap-1 text-xs ${w.trend > 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {w.trend > 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                      {w.trend > 0 ? "+" : ""}
                      {w.trend} σε 30 ημέρες
                    </span>
                  ) : null}
                  {w.nextDeadline ? (
                    <span className="text-xs text-muted-foreground">
                      {w.nextDeadline.label}: {w.nextDeadline.daysLeft === 0 ? "λήγει σήμερα" : `σε ${w.nextDeadline.daysLeft} ημέρες`}
                    </span>
                  ) : null}
                </div>
                {w.topFindings.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {w.topFindings.map((f) => (
                      <li key={f.title} className="break-words">
                        • {f.title}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Κανένα ανοιχτό εύρημα συμμόρφωσης.</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="text-xs text-muted-foreground">Προτεραιότητα {w.priority}</span>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/office/open?org=${w.orgId}&to=${encodeURIComponent("/risks")}`}>Άνοιγμα radar</Link>
                </Button>
              </div>
            </div>

            {w.anomalies.length ? (
              <div className="mt-3 space-y-2" data-testid={`anomalies-${w.orgId}`}>
                {w.anomalies.map((a) => (
                  <div key={a.code} className="rounded-lg bg-muted/60 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${a.severity === "high" ? "text-destructive" : "text-amber-600"}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium break-words">{a.title}</div>
                        <p className="text-xs break-words text-muted-foreground">{a.detail}</p>
                        <p className="mt-1 text-xs break-words">
                          <span className="font-medium">Ενέργεια:</span> {a.action}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
