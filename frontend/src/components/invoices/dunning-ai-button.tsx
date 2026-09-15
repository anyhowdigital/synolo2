"use client";

import { useState, useTransition } from "react";
import { Sparkles, Mail, MessageSquare, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { generateDunningReminder } from "@/app/actions/ai-dunning";
import { sendDunningEmail } from "@/app/actions/send-dunning-email";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SCORE_LABEL: Record<string, { label: string; className: string }> = {
  good: { label: "Καλό ιστορικό", className: "bg-emerald-100 text-emerald-800" },
  average: { label: "Μέτριο ιστορικό", className: "bg-amber-100 text-amber-800" },
  poor: { label: "Προβληματικό ιστορικό", className: "bg-red-100 text-red-800" },
};

export function DunningAiButton({ invoiceId }: { invoiceId: string }) {
  const [step, setStep] = useState<"1" | "2" | "3">("1");
  const [pending, startTransition] = useTransition();
  const [sending, startSending] = useTransition();
  const [reminder, setReminder] = useState<{ subject: string; body_text: string; tone: string; sms_body: string } | null>(null);
  const [creditScore, setCreditScore] = useState<string>("average");
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  function generate() {
    setReminder(null);
    startTransition(async () => {
      const res = await generateDunningReminder(invoiceId, Number(step) as 1 | 2 | 3);
      if (!res.ok) { toast.error(res.error); return; }
      setReminder(res.reminder);
      setSubject(res.reminder.subject);
      setBody(res.reminder.body_text);
      setCreditScore(res.creditScore);
      toast.success("Το AI δημιούργησε την υπενθύμιση.");
    });
  }

  function sendEmail() {
    if (!subject.trim() || !body.trim()) { toast.error("Θέμα και κείμενο απαραίτητα."); return; }
    startSending(async () => {
      const res = await sendDunningEmail(invoiceId, subject, body);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(res.queued ? "Το email μπήκε στην ουρά αποστολής (Resend)." : "Το email αποθηκεύτηκε στο outbox (logged mode).");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" data-testid="dunning-ai-btn">
          <Sparkles className="size-4" /> AI Υπενθύμιση
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /> Έξυπνη υπενθύμιση πληρωμής</DialogTitle>
          <DialogDescription>Η τεχνητή νοημοσύνη (Claude) δημιουργεί προσαρμοσμένο κείμενο βάσει της συναλλακτικής συμπεριφοράς του πελάτη.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label>Βήμα υπενθύμισης</Label>
            <Select value={step} onValueChange={(v) => setStep(v as "1" | "2" | "3")}>
              <SelectTrigger data-testid="dunning-step-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 · Ευγενική υπενθύμιση (πρώτο ραβασάκι)</SelectItem>
                <SelectItem value="2">2 · Σοβαρή προειδοποίηση με προθεσμία</SelectItem>
                <SelectItem value="3">3 · Τελική ειδοποίηση πριν νομικές ενέργειες</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={generate} disabled={pending} data-testid="dunning-generate-btn">
            {pending ? <><Loader2 className="size-4 animate-spin" /> Παραγωγή…</> : <><Sparkles className="size-4" /> Δημιουργία με AI</>}
          </Button>
          {reminder ? (
            <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <Badge className={SCORE_LABEL[creditScore]?.className ?? ""}>{SCORE_LABEL[creditScore]?.label ?? creditScore}</Badge>
                <Badge variant="outline">Τόνος: {reminder.tone}</Badge>
              </div>
              <div className="grid gap-1">
                <Label className="flex items-center gap-1 text-xs"><Mail className="size-3" /> Θέμα</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="text-sm" data-testid="dunning-subject" />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Κείμενο email (μπορείτε να το επεξεργαστείτε)</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="text-sm" data-testid="dunning-body" />
              </div>
              <div className="grid gap-1">
                <Label className="flex items-center gap-1 text-xs"><MessageSquare className="size-3" /> SMS (backup)</Label>
                <div className="rounded border bg-card p-2 text-xs">{reminder.sms_body}</div>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          {reminder ? (
            <>
              <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(body); toast.success("Το κείμενο αντιγράφηκε."); }}>
                Αντιγραφή
              </Button>
              <Button type="button" onClick={sendEmail} disabled={sending} data-testid="dunning-send-btn">
                {sending ? <><Loader2 className="size-4 animate-spin" /> Αποστολή…</> : <><Send className="size-4" /> Αποστολή email</>}
              </Button>
            </>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Κλείσιμο</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
