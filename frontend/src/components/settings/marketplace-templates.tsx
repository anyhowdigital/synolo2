"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Stethoscope, Wrench, ShoppingBag, Hotel, GraduationCap, Dumbbell, UtensilsCrossed, Loader2, Laptop, Scissors, Pill, Building2, Truck, Calculator, Camera } from "lucide-react";
import { toast } from "sonner";
import { applyTemplate, type ActionResult } from "@/app/actions/marketplace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const TEMPLATE_META = [
  { id: "lawyer", label: "Δικηγόρος", desc: "ΤΠΥ, γραμμάτιο ΔΣΑ, ωριαία συμβουλευτική.", Icon: Briefcase },
  { id: "doctor", label: "Ιατρός", desc: "ΑΠΥ με απαλλαγή ΦΠΑ (Άρθρο 22), βεβαιώσεις.", Icon: Stethoscope },
  { id: "engineer", label: "Μηχανικός", desc: "Μελέτες, επιβλέψεις, ενεργειακά πιστοποιητικά.", Icon: Wrench },
  { id: "eshop", label: "E-shop", desc: "ΑΛΠ, ΤΠ B2B, πιστωτικά επιστροφών.", Icon: ShoppingBag },
  { id: "hospitality", label: "Τουριστικό κατάλυμα", desc: "Διανυκτέρευση, τέλος διαμονής, ανθεκτικότητα κλίματος.", Icon: Hotel },
  { id: "tutoring", label: "Φροντιστήριο", desc: "ΑΠΥ μαθημάτων με απαλλαγή ΦΠΑ (εκπαίδευση).", Icon: GraduationCap },
  { id: "gym", label: "Γυμναστήριο", desc: "Συνδρομές, ημερήσιες επισκέψεις, personal training.", Icon: Dumbbell },
  { id: "restaurant", label: "Εστίαση", desc: "ΑΛΠ κατανάλωσης, delivery, catering.", Icon: UtensilsCrossed },
  { id: "freelancer", label: "IT Freelancer", desc: "ΤΠΥ, retainer, ενδοκοινοτικές (reverse charge).", Icon: Laptop },
  { id: "hairdresser", label: "Κομμωτήριο / Beauty", desc: "Κοπή, χτένισμα, βαφή, spa.", Icon: Scissors },
  { id: "pharmacy", label: "Φαρμακείο", desc: "ΑΛΠ φαρμάκων 6%, ΕΟΠΥΥ, καλλυντικά.", Icon: Pill },
  { id: "realestate", label: "Μεσιτικό", desc: "Αμοιβή πώλησης/μίσθωσης, εκτιμήσεις.", Icon: Building2 },
  { id: "transport", label: "Μεταφορές / Ταξί", desc: "Κόμιστρο, χιλιομετρική, ΔΑ.", Icon: Truck },
  { id: "accountant", label: "Λογιστικό γραφείο", desc: "Τήρηση βιβλίων, Ε1/Ε3, ΦΠΑ.", Icon: Calculator },
  { id: "photographer", label: "Φωτογράφος", desc: "Γάμοι, βάπτιση, εταιρική φωτογράφιση.", Icon: Camera },
];

export function MarketplaceTemplates() {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(applyTemplate, null);
  if (state && !state.ok) toast.error(state.error);
  if (state && state.ok) toast.success(`Δημιουργήθηκαν ${state.imported} νέες εγγραφές. Ελέγξτε Σειρές & Είδη.`);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Marketplace Templates</CardTitle>
        <CardDescription>Προ-ρυθμισμένα πακέτα ανά επάγγελμα με έτοιμες σειρές παραστατικών, χαρακτηρισμούς myDATA & δείγματα ειδών. Ένα κλικ — προσθέτονται μόνο όσα δεν υπάρχουν ήδη.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {TEMPLATE_META.map(({ id, label, desc, Icon }) => (
            <form key={id} action={action} className="rounded-lg border p-4 transition hover:border-primary hover:shadow-sm">
              <input type="hidden" name="templateId" value={id} />
              <div className="mb-2 flex items-center gap-2">
                <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary"><Icon className="size-5" /></div>
                <div>
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-xs text-muted-foreground">{desc}</div>
                </div>
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={pending} className="mt-2 w-full" data-testid={`template-apply-${id}`}>
                {pending ? <Loader2 className="size-3 animate-spin" /> : null} Εφαρμογή πακέτου
              </Button>
            </form>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
