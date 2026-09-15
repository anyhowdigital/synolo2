import Link from "next/link";
import { Lightbulb } from "lucide-react";
import type { Organization } from "@/db/schema";
import { getDb } from "@/db";
import { taxAdvisor } from "@/lib/services/tax-advisor";
import { formatMoney } from "@/lib/invoice/totals";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Contextual insight «Σύμβουλος»: δείχνει την κορυφαία νόμιμη ευκαιρία μέσα στη ροή εργασίας. */
export async function AdvisorInsight({ org }: { org: Organization }) {
  const db = await getDb();
  let top;
  try {
    const { active } = await taxAdvisor(db, org);
    top = active.find((o) => o.estimatedBenefit > 0) ?? active[0];
  } catch {
    return null;
  }
  if (!top) return null;
  return (
    <Alert className="mb-4" data-testid="advisor-insight">
      <Lightbulb className="size-4" />
      <AlertTitle className="flex items-center justify-between gap-2">
        <span>Σύμβουλος: {top.title}</span>
        {top.estimatedBenefit > 0 ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs tabular-nums text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            ~{formatMoney(top.estimatedBenefit)}/έτος
          </span>
        ) : null}
      </AlertTitle>
      <AlertDescription>
        {top.rationale}{" "}
        <Link href="/advisor" className="font-medium underline" data-testid="advisor-insight-link">
          Δείτε όλες τις ευκαιρίες →
        </Link>
      </AlertDescription>
    </Alert>
  );
}
