import { CalendarClock } from "lucide-react";
import { getDb } from "@/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentOrg } from "@/lib/services/org";
import { taxDeadlines } from "@/lib/services/compliance";
import { formatDate } from "@/lib/invoice/totals";

export default async function DeadlinesPage() {
  const db = await getDb();
  const org = await getCurrentOrg(db);
  const { items } = taxDeadlines(org);

  return (
    <>
      <PageHeader title="Ημερολόγιο προθεσμιών" description="Οι επόμενες φορολογικές και ασφαλιστικές υποχρεώσεις. Λαμβάνετε ειδοποίηση 7 ημέρες και 1 ημέρα πριν από κάθε προθεσμία." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="deadlines-list">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Δεν υπάρχουν προθεσμίες στο επόμενο τρίμηνο.</p>
        ) : (
          items.map((d) => (
            <Card key={`${d.code}-${d.date}`} data-testid={`deadline-${d.code}-${d.date}`}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between gap-2">
                  <span className="truncate">{d.code}</span>
                  <Badge variant={d.days <= 1 ? "destructive" : d.days <= 7 ? "default" : "outline"} className="shrink-0">
                    {d.days === 0 ? "Σήμερα" : d.days === 1 ? "Αύριο" : `σε ${d.days} ημέρες`}
                  </Badge>
                </CardDescription>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                  {d.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <div className="font-medium text-foreground tabular-nums">{formatDate(d.date)}</div>
                <p>{d.note}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Το ημερολόγιο έχει ενημερωτικό χαρακτήρα. Οι τελικές υποχρεώσεις εξαρτώνται από το φορολογικό προφίλ της επιχείρησης και τυχόν παρατάσεις της ΑΑΔΕ.
      </p>
    </>
  );
}
