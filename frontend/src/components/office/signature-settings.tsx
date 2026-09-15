"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Stamp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSignatureAction } from "@/app/actions/doc-registry";

export function SignatureSettings({ signatureName, regNo, stampDataUrl }: { signatureName: string; regNo: string; stampDataUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState(signatureName);
  const [reg, setReg] = useState(regNo);
  const [stamp, setStamp] = useState(stampDataUrl);
  const [pending, start] = useTransition();

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 400_000) {
      toast.error("Η σφραγίδα να είναι έως 400 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setStamp(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Υπογραφή & σφραγίδα λογιστή</CardTitle>
        <CardDescription>Τα στοιχεία αυτά εμφανίζονται στη δημόσια σελίδα επαλήθευσης κάθε εγγράφου που εκδίδετε.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="sig-name" className="text-xs">
              Ονοματεπώνυμο υπογράφοντος
            </Label>
            <Input id="sig-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="signature-name" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sig-reg" className="text-xs">
              Α.Μ. ΟΕΕ / άδεια άσκησης
            </Label>
            <Input id="sig-reg" value={reg} onChange={(e) => setReg(e.target.value)} data-testid="signature-regno" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input type="file" accept="image/png,image/jpeg" onChange={(e) => onFile(e.target.files?.[0])} className="max-w-xs" data-testid="signature-stamp-input" />
          {stamp ? <img src={stamp} alt="Σφραγίδα" className="h-14 rounded border bg-white p-1" /> : <Stamp className="size-5 text-muted-foreground" />}
        </div>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveSignatureAction({ signatureName: name, regNo: reg, stampDataUrl: stamp });
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success("Τα στοιχεία υπογραφής αποθηκεύτηκαν.");
              router.refresh();
            })
          }
          data-testid="signature-save"
        >
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null} Αποθήκευση
        </Button>
      </CardContent>
    </Card>
  );
}
