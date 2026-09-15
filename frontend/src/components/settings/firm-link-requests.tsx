"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { decideFirmLinkAction } from "@/app/actions/accountant";

type Req = { id: string; firmName: string; email: string; afm: string; note: string; createdAt: string };

export function FirmLinkRequests({ requests }: { requests: Req[] }) {
  const [pending, start] = useTransition();
  if (requests.length === 0) return null;
  return (
    <Card className="mb-6 border-amber-300" data-testid="firm-link-requests">
      <CardHeader>
        <CardTitle className="text-base">Αιτήματα συνεργασίας λογιστή ({requests.length})</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {requests.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0" data-testid={`firm-link-req-${r.id}`}>
            <div className="min-w-0 text-sm">
              <div className="font-medium">{r.firmName}</div>
              <div className="text-xs text-muted-foreground">
                {r.email}
                {r.afm ? ` · ΑΦΜ ${r.afm}` : ""} · {new Date(r.createdAt).toLocaleDateString("el-GR")}
              </div>
              {r.note ? <p className="mt-1 text-xs">{r.note}</p> : null}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                data-testid={`firm-link-approve-${r.id}`}
                onClick={() =>
                  start(async () => {
                    const res = await decideFirmLinkAction(r.id, true);
                    if (res.ok) toast.success(`Ο λογιστής «${r.firmName}» έχει πλέον πρόσβαση.`);
                    else toast.error(res.error);
                  })
                }
              >
                <Check data-icon="inline-start" /> Έγκριση
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                data-testid={`firm-link-reject-${r.id}`}
                onClick={() =>
                  start(async () => {
                    const res = await decideFirmLinkAction(r.id, false);
                    if (res.ok) toast.success("Το αίτημα απορρίφθηκε.");
                    else toast.error(res.error);
                  })
                }
              >
                <X data-icon="inline-start" /> Απόρριψη
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
