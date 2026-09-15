"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function UploadForm({ token, items }: { token: string; items: { label: string; uploaded: boolean }[] }) {
  const [state, setState] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (label: string, file: File) => {
    setBusy(label);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("label", label);
    const res = await fetch(`/api/upload/${token}`, { method: "POST", body: fd });
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({ error: "Η μεταφόρτωση απέτυχε." }))).error);
      return;
    }
    setState((prev) => prev.map((i) => (i.label === label ? { ...i, uploaded: true } : i)));
  };

  const remaining = state.filter((i) => !i.uploaded).length;

  return (
    <div className="mt-8 space-y-4" data-testid="public-upload-form">
      {state.map((item) => (
        <div key={item.label} className="rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`f-${item.label}`} className="text-sm">
              {item.label}
            </Label>
            {item.uploaded ? (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="size-4" /> Ανέβηκε
              </span>
            ) : busy === item.label ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4 text-muted-foreground" />
            )}
          </div>
          <Input
            id={`f-${item.label}`}
            type="file"
            className="mt-2"
            disabled={busy !== null || item.uploaded}
            data-testid={`upload-input-${item.label}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(item.label, f);
            }}
          />
        </div>
      ))}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {remaining === 0 ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900" data-testid="upload-complete">
          Ευχαριστούμε! Λάβαμε όλα τα έγγραφα – μπορείτε να κλείσετε τη σελίδα.
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Απομένουν {remaining} έγγραφα. Μέγιστο μέγεθος αρχείου 8 MB.</p>
      )}

      <Button variant="ghost" className="w-full" disabled>
        Δεν χρειάζεται σύνδεση ή κωδικός
      </Button>
    </div>
  );
}
