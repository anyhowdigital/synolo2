"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { staffClockAction, staffLoginAction, staffLogoutAction } from "@/app/actions/staff";

export function StaffPinForm({ token }: { token: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [pending, start] = useTransition();
  return (
    <Card className="max-w-sm" data-testid="staff-pin-card">
      <CardHeader>
        <CardTitle className="text-base">Εισάγετε το PIN σας</CardTitle>
        <CardDescription>Το 4ψήφιο PIN σάς το έδωσε ο εργοδότης ή ο λογιστής.</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Input inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" className="text-center text-lg tracking-[0.5em]" data-testid="staff-pin-input" />
        <Button
          disabled={pending || pin.length !== 4}
          onClick={() =>
            start(async () => {
              const res = await staffLoginAction(token, pin);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              router.refresh();
            })
          }
          data-testid="staff-pin-submit"
        >
          {pending ? <Loader2 className="animate-spin" /> : <LogIn />} Είσοδος
        </Button>
      </CardContent>
    </Card>
  );
}

export function StaffClock({ token, open, done }: { token: string; open: boolean; done: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (dir: "in" | "out") =>
    start(async () => {
      const res = await staffClockAction(token, dir);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="lg" disabled={pending || open || done} onClick={() => act("in")} data-testid="staff-clock-in">
        <LogIn data-icon="inline-start" /> Άφιξη
      </Button>
      <Button size="lg" variant="secondary" disabled={pending || !open} onClick={() => act("out")} data-testid="staff-clock-out">
        <LogOut data-icon="inline-start" /> Αναχώρηση
      </Button>
      <Button variant="ghost" className="ml-auto" onClick={() => start(async () => { await staffLogoutAction(token); router.refresh(); })} data-testid="staff-logout">
        Αποσύνδεση
      </Button>
    </div>
  );
}
