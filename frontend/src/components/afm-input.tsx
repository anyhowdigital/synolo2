"use client";

import { useState, type ComponentProps } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { isValidAfm } from "@/lib/greek/afm";

type Props = Omit<ComponentProps<typeof Input>, "onChange" | "defaultValue" | "value"> & {
  defaultValue?: string;
  /** Όταν false (π.χ. VAT ID εξωτερικού), δεν γίνεται έλεγχος ψηφίου ελέγχου. */
  validate?: boolean;
  onValueChange?: (value: string) => void;
};

/** Πεδίο ΑΦΜ με άμεσο έλεγχο εγκυρότητας (9 ψηφία, modulo 11) καθώς πληκτρολογεί ο χρήστης. */
export function AfmInput({ defaultValue = "", validate = true, onValueChange, className, ...props }: Props) {
  const [value, setValue] = useState(defaultValue);
  const digits = value.replace(/\D/g, "");
  const status = !validate || digits.length === 0 ? "idle" : digits.length < 9 ? "partial" : isValidAfm(digits) ? "valid" : "invalid";

  return (
    <div className="grid gap-1">
      <div className="relative">
        <Input
          {...props}
          value={value}
          inputMode="numeric"
          maxLength={validate ? 9 : props.maxLength}
          aria-invalid={props["aria-invalid"] || status === "invalid" || undefined}
          className={cn(validate ? "pr-9" : "", className)}
          onChange={(e) => {
            const next = validate ? e.target.value.replace(/\D/g, "").slice(0, 9) : e.target.value;
            setValue(next);
            onValueChange?.(next);
          }}
        />
        {status === "valid" ? <CheckCircle2 className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-emerald-600" aria-hidden /> : null}
        {status === "invalid" ? <XCircle className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-destructive" aria-hidden /> : null}
      </div>
      {status === "invalid" ? <p className="text-xs text-destructive">Μη έγκυρο ΑΦΜ – ελέγξτε τα ψηφία.</p> : null}
      {status === "partial" ? <p className="text-xs text-muted-foreground">{9 - digits.length} ψηφία ακόμη.</p> : null}
    </div>
  );
}
