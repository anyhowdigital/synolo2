import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ClientAlert } from "@/lib/services/client-alerts";

const SEV: Record<string, { label: string; variant: "destructive" | "secondary" | "outline" }> = {
  high: { label: "Κρίσιμο", variant: "destructive" },
  medium: { label: "Προσοχή", variant: "secondary" },
  low: { label: "Παρατήρηση", variant: "outline" },
};

/** Κάρτα «Έλεγχος βιβλίων» για το πάνελ της επιχείρησης — τα ίδια ευρήματα που βλέπει ο λογιστής. */
export function BookChecksCard({ alerts }: { alerts: ClientAlert[] }) {
  const high = alerts.filter((a) => a.severity === "high");
  return (
    <Card data-testid="book-checks-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {alerts.length ? <AlertTriangle className="size-4 text-amber-600" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
            Έλεγχος βιβλίων
          </CardTitle>
          <div className="flex items-center gap-2">
            {high.length ? <Badge variant="destructive">{high.length} κρίσιμα</Badge> : null}
            <Badge variant="outline">{alerts.length} ευρήματα</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Δεν εντοπίστηκαν λάθη — τα βιβλία σας είναι καθαρά. Ο ίδιος έλεγχος τρέχει και στον λογιστή σας.</p>
        ) : (
          <>
            {alerts.slice(0, 5).map((a, i) => (
              <div key={`${a.code}-${i}`} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant={SEV[a.severity].variant}>{SEV[a.severity].label}</Badge>
                  <span className="text-sm font-medium">{a.title}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild size="sm" variant="secondary">
                <Link href="/mydata" data-testid="book-checks-mydata">
                  myDATA
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/expenses?status=draft" data-testid="book-checks-expenses">
                  Αχαρακτήριστα έξοδα
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/risks">Κίνδυνοι & συμμόρφωση</Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
