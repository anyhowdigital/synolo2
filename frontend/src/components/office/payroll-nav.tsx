import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Κοινή πλοήγηση ενοτήτων προσωπικού στο πάνελ λογιστή. */
export function PayrollNav({ orgId, month, active }: { orgId: string; month: string; active: "employees" | "payroll" | "ergani" | "assets" }) {
  const items = [
    ["employees", "Προσωπικό", `/office/clients/${orgId}/employees?month=${month}`],
    ["payroll", "Μισθοδοσία & δώρα", `/office/clients/${orgId}/payroll?month=${month}`],
    ["ergani", "Βάρδιες & ΕΡΓΑΝΗ", `/office/clients/${orgId}/ergani?month=${month}`],
    ["assets", "Πάγια", `/office/clients/${orgId}/assets?month=${month}`],
  ] as const;
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1" data-testid="payroll-nav">
      {items.map(([key, label, href]) => (
        <Button key={key} asChild size="sm" variant={key === active ? "default" : "ghost"}>
          <Link href={href} data-testid={`payroll-nav-${key}`}>
            {label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
