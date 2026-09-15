import Link from "next/link";
import type { AuditLog } from "@/db/schema";
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS } from "@/lib/services/audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Props {
  rows: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  entity?: string;
}

function entityHref(row: AuditLog): string | null {
  if (row.entity === "invoice") return `/invoices/${row.entityId}`;
  if (row.entity === "customer" && row.action !== "deleted") return `/customers/${row.entityId}`;
  if (row.entity === "expense") return `/expenses`;
  return null;
}

export function AuditLogTable({ rows, total, page, pageSize, entity }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (p: number) => `/settings?tab=audit&page=${p}${entity ? `&entity=${entity}` : ""}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ιστορικό ενεργειών</CardTitle>
        <CardDescription>
          Πλήρες audit trail: ποιος, τι και πότε – εκδόσεις, διαβιβάσεις myDATA, εισπράξεις, αλλαγές ρυθμίσεων και χρηστών. {total.toLocaleString("el-GR")} εγγραφές.
        </CardDescription>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button asChild size="xs" variant={!entity ? "default" : "outline"}>
            <Link href="/settings?tab=audit">Όλα</Link>
          </Button>
          {Object.entries(AUDIT_ENTITY_LABELS).map(([code, label]) => (
            <Button key={code} asChild size="xs" variant={entity === code ? "default" : "outline"}>
              <Link href={`/settings?tab=audit&entity=${code}`}>{label}</Link>
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Δεν υπάρχουν εγγραφές ακόμη.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ημ/νία</TableHead>
                <TableHead>Χρήστης</TableHead>
                <TableHead>Οντότητα</TableHead>
                <TableHead>Ενέργεια</TableHead>
                <TableHead>Λεπτομέρειες</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const href = entityHref(r);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{new Date(r.createdAt).toLocaleString("el-GR")}</TableCell>
                    <TableCell className="text-sm">
                      {r.actorName ?? <span className="text-muted-foreground">—</span>}
                      {r.ipAddress ? <span className="ml-1 font-mono text-[10px] text-muted-foreground">{r.ipAddress}</span> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{AUDIT_ENTITY_LABELS[r.entity] ?? r.entity}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{AUDIT_ACTION_LABELS[r.action] ?? r.action}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-sm text-muted-foreground" title={r.detail ?? ""}>
                      {href ? (
                        <Link href={href} className="underline-offset-2 hover:underline">
                          {r.detail || "Προβολή"}
                        </Link>
                      ) : (
                        r.detail
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {pages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Σελίδα {page} από {pages}
            </span>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline" disabled={page <= 1}>
                <Link href={link(Math.max(1, page - 1))} aria-disabled={page <= 1}>
                  Προηγούμενη
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" disabled={page >= pages}>
                <Link href={link(Math.min(pages, page + 1))} aria-disabled={page >= pages}>
                  Επόμενη
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
