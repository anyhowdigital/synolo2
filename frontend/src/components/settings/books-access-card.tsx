"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setBooksSelfManageAction } from "@/app/actions/doc-registry";

export function BooksAccessCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Ευαίσθητα λογιστικά (διπλογραφικά, μισθοδοσία)</CardTitle>
        <CardDescription>
          Από προεπιλογή τα τηρεί <strong>μόνο ο λογιστής σας</strong>. Εσείς τα βλέπετε για ανάγνωση. Ενεργοποιήστε το παρακάτω αν θέλετε να καταχωρείτε και εσείς άρθρα, να κλείνετε χρήση και να αλλάζετε λογιστικό σχέδιο.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <Switch
          id="books-self"
          checked={enabled}
          disabled={pending}
          onCheckedChange={(v) =>
            start(async () => {
              const res = await setBooksSelfManageAction(v);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success(v ? "Μπορείτε πλέον να διαχειρίζεστε τα διπλογραφικά." : "Τα διπλογραφικά τα διαχειρίζεται μόνο ο λογιστής.");
              router.refresh();
            })
          }
          data-testid="books-self-manage-switch"
        />
        <Label htmlFor="books-self" className="text-sm">
          Θέλω να διαχειρίζομαι και εγώ τα ευαίσθητα λογιστικά
        </Label>
      </CardContent>
    </Card>
  );
}
