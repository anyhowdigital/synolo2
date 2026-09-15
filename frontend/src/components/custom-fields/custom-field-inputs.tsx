"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCustomFieldValue, type CustomFieldDef, type CustomFieldValues } from "@/lib/services/custom-fields";

/**
 * Πεδία εισαγωγής για custom πεδία. Με `values`/`onChange` λειτουργεί ελεγχόμενα (editor παραστατικών),
 * αλλιώς γράφει native inputs `cf.<id>` για υποβολή με FormData.
 */
export function CustomFieldInputs({
  defs,
  defaultValues = {},
  values,
  onChange,
  columns = 2,
}: {
  defs: CustomFieldDef[];
  defaultValues?: CustomFieldValues;
  values?: CustomFieldValues;
  onChange?: (values: CustomFieldValues) => void;
  columns?: 1 | 2 | 3;
}) {
  if (!defs.length) return null;
  const current = values ?? defaultValues;
  const set = (id: string, v: CustomFieldValues[string]) => onChange?.({ ...current, [id]: v });
  const controlled = values !== undefined;
  const grid = columns === 3 ? "sm:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "";

  return (
    <div className={`grid gap-4 ${grid}`}>
      {defs.map((def) => {
        const name = `cf.${def.id}`;
        const val = current[def.id];
        const label = (
          <Label htmlFor={name}>
            {def.label} {def.required ? "*" : ""}
          </Label>
        );
        if (def.type === "checkbox") {
          return (
            <div key={def.id} className="flex items-center gap-2 pt-6">
              {controlled ? (
                <Checkbox id={name} checked={!!val} onCheckedChange={(c) => set(def.id, c === true)} />
              ) : (
                <Checkbox id={name} name={name} defaultChecked={!!val} />
              )}
              <Label htmlFor={name}>{def.label}</Label>
            </div>
          );
        }
        if (def.type === "select") {
          return (
            <div key={def.id} className="grid gap-2">
              {label}
              <select
                id={name}
                name={controlled ? undefined : name}
                required={def.required}
                value={controlled ? String(val ?? "") : undefined}
                defaultValue={controlled ? undefined : String(val ?? "")}
                onChange={controlled ? (e) => set(def.id, e.target.value || null) : undefined}
                className="h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
              >
                <option value="">—</option>
                {def.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        return (
          <div key={def.id} className="grid gap-2">
            {label}
            <Input
              id={name}
              name={controlled ? undefined : name}
              type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
              step={def.type === "number" ? "any" : undefined}
              required={def.required}
              value={controlled ? String(val ?? "") : undefined}
              defaultValue={controlled ? undefined : String(val ?? "")}
              onChange={controlled ? (e) => set(def.id, def.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value || null) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Ανάγνωση: λίστα «Ετικέτα: τιμή» για σελίδες προβολής. */
export function CustomFieldList({ defs, values, className }: { defs: CustomFieldDef[]; values: CustomFieldValues; className?: string }) {
  const rows = defs.map((d) => [d.label, formatCustomFieldValue(d, values[d.id])] as const).filter(([, v]) => v);
  if (!rows.length) return null;
  return (
    <dl className={className ?? "grid gap-1 text-sm sm:grid-cols-2"}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="text-muted-foreground">{k}:</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
