"use client";

import { useState, useTransition } from "react";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { saveNotificationPrefsAction } from "@/app/actions/notifications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export interface PrefRow {
  type: string;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
}

export function NotificationPrefsCard({ rows: initial, smtpConfigured }: { rows: PrefRow[]; smtpConfigured: boolean }) {
  const [rows, setRows] = useState(initial);
  const [pending, start] = useTransition();

  const toggle = (type: string, channel: "inApp" | "email", value: boolean) => {
    setRows((prev) => prev.map((r) => (r.type === type ? { ...r, [channel]: value } : r)));
    start(async () => {
      const res = await saveNotificationPrefsAction({ [type]: { [channel]: value } });
      if (!res.ok) {
        toast.error(res.error);
        setRows((prev) => prev.map((r) => (r.type === type ? { ...r, [channel]: !value } : r)));
      }
    });
  };

  return (
    <Card id="notifications">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4" /> Ειδοποιήσεις
          {pending ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
        </CardTitle>
        <CardDescription>
          Επιλέξτε για ποια γεγονότα θέλετε ειδοποίηση μέσα στην εφαρμογή (καμπανάκι) και ποια να φτάνουν και με email.
          {!smtpConfigured ? " Τα email καταγράφονται στο Outbox μέχρι να ρυθμιστεί SMTP στις Ρυθμίσεις." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-3 text-sm">
          <div />
          <div className="text-center text-xs font-medium text-muted-foreground">Εφαρμογή</div>
          <div className="text-center text-xs font-medium text-muted-foreground">Email</div>
          {rows.map((r) => (
            <div key={r.type} className="contents">
              <div>
                <div className="font-medium">{r.label}</div>
                <div className="text-xs text-muted-foreground">{r.description}</div>
              </div>
              <div className="flex justify-center">
                <Switch checked={r.inApp} onCheckedChange={(v) => toggle(r.type, "inApp", v)} aria-label={`${r.label} – εφαρμογή`} />
              </div>
              <div className="flex justify-center">
                <Switch checked={r.email} onCheckedChange={(v) => toggle(r.type, "email", v)} aria-label={`${r.label} – email`} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
