"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { savePdfThemeAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_PDF_THEME, PDF_ACCENT_PRESETS, PDF_DENSITIES, PDF_TEMPLATES, encodeThemeParam, type PdfTheme } from "@/lib/pdf/theme";
import { cn } from "@/lib/utils";

const COLUMN_LABELS: { key: keyof PdfTheme["columns"]; label: string; hint: string }[] = [
  { key: "qty", label: "Ποσότητα", hint: "Αν κρυφτεί, εμφανίζεται δίπλα στην περιγραφή μόνο όταν ≠ 1." },
  { key: "unitPrice", label: "Τιμή μονάδας", hint: "Χρήσιμο σε παραστατικά υπηρεσιών με ενιαία αξία." },
  { key: "discount", label: "Έκπτωση %", hint: "Στήλη έκπτωσης ανά γραμμή." },
  { key: "vat", label: "ΦΠΑ %", hint: "Ο συντελεστής ανά γραμμή. Η ανάλυση ΦΠΑ στα σύνολα παραμένει." },
];

const VISIBILITY: { key: "showLogo" | "showQr" | "showBankDetails" | "showVatBreakdown" | "showSignatureBox"; label: string; hint: string }[] = [
  { key: "showLogo", label: "Λογότυπο", hint: "Από τα στοιχεία επιχείρησης." },
  { key: "showQr", label: "QR code myDATA", hint: "Υποχρεωτικό για διαβιβασμένα παραστατικά – κρύψτε το μόνο σε προσφορές/εσωτερικά έγγραφα." },
  { key: "showBankDetails", label: "Τραπεζικά στοιχεία", hint: "IBAN/τράπεζα για εξόφληση." },
  { key: "showVatBreakdown", label: "Ανάλυση ΦΠΑ ανά συντελεστή", hint: "Πίνακας καθαρής αξίας/ΦΠΑ ανά κατηγορία." },
  { key: "showSignatureBox", label: "Πλαίσια υπογραφών", hint: "Δύο θέσεις υπογραφής στο κάτω μέρος (εκδότης / παραλαβών)." },
];

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function AppearancePanel({ initial }: { initial: PdfTheme }) {
  const [theme, setTheme] = useState<PdfTheme>(initial);
  const [saved, setSaved] = useState<string>(JSON.stringify(initial));
  const [hexText, setHexText] = useState(initial.accentColor);
  const [pending, start] = useTransition();
  const debounced = useDebounced(theme, 350);
  const previewUrl = `/print/preview?t=${encodeThemeParam(debounced)}`;
  const dirty = JSON.stringify(theme) !== saved;

  const patch = (p: Partial<PdfTheme>) => {
    setTheme((t) => ({ ...t, ...p }));
    if (p.accentColor) setHexText(p.accentColor);
  };

  const save = () =>
    start(async () => {
      const res = await savePdfThemeAction(JSON.stringify(theme));
      if (res.ok) {
        setSaved(JSON.stringify(theme));
        toast.success("Η εμφάνιση των παραστατικών αποθηκεύτηκε.");
      } else toast.error(res.error);
    });

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Πρότυπο & χρώμα</CardTitle>
            <CardDescription>Ισχύει για την εκτυπώσιμη μορφή, το PDF και τη δημόσια σελίδα κάθε παραστατικού.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label>Πρότυπο</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {PDF_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => patch({ template: t.id })}
                    aria-pressed={theme.template === t.id}
                    data-testid={`pdf-template-${t.id}`}
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent",
                      theme.template === t.id ? "border-primary ring-2 ring-primary/30" : "border-border",
                    )}
                  >
                    <div className="mx-auto w-full max-w-[132px] overflow-hidden rounded-md border bg-white">
                      <TemplateThumb id={t.id} accent={theme.accentColor} />
                    </div>
                    <div className="mt-2 font-medium">{t.label}</div>
                    <div className="hidden text-xs leading-snug text-muted-foreground sm:block">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="accent">Χρώμα επιχείρησης</Label>
              <div className="flex flex-wrap items-center gap-2">
                {PDF_ACCENT_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    aria-label={`Χρώμα ${c}`}
                    onClick={() => patch({ accentColor: c })}
                    className={cn("flex size-8 items-center justify-center rounded-full border", theme.accentColor === c ? "ring-2 ring-offset-2 ring-primary" : "")}
                    style={{ backgroundColor: c }}
                  >
                    {theme.accentColor === c ? <Check className="size-4 text-white mix-blend-difference" /> : null}
                  </button>
                ))}
                <input
                  type="color"
                  value={theme.accentColor}
                  onChange={(e) => patch({ accentColor: e.target.value.toLowerCase() })}
                  className="size-8 cursor-pointer rounded-full border bg-transparent p-0"
                  aria-label="Προσαρμοσμένο χρώμα"
                />
                <Input
                  id="accent"
                  value={hexText}
                  onChange={(e) => {
                    const v = e.target.value.trim().toLowerCase();
                    setHexText(v);
                    if (/^#[0-9a-f]{6}$/.test(v)) patch({ accentColor: v });
                  }}
                  onBlur={() => setHexText(theme.accentColor)}
                  className="w-28 font-mono text-xs"
                  placeholder="#1d4ed8"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Πυκνότητα</Label>
              <div className="inline-flex rounded-lg border p-0.5">
                {PDF_DENSITIES.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={theme.density === d.id}
                    onClick={() => patch({ density: d.id })}
                    className={cn("rounded-md px-3 py-1.5 text-sm", theme.density === d.id ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Στήλες & στοιχεία</CardTitle>
            <CardDescription>Επιλέξτε ποιες στήλες του πίνακα γραμμών και ποια τμήματα εμφανίζονται.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Στήλες γραμμών</p>
              {COLUMN_LABELS.map((c) => (
                <div key={c.key} className="flex items-start justify-between gap-4">
                  <div>
                    <Label htmlFor={`col-${c.key}`}>{c.label}</Label>
                    <p className="text-xs text-muted-foreground">{c.hint}</p>
                  </div>
                  <Switch id={`col-${c.key}`} checked={theme.columns[c.key]} onCheckedChange={(v) => patch({ columns: { ...theme.columns, [c.key]: v } })} />
                </div>
              ))}
            </div>
            <div className="grid gap-3 border-t pt-4">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Τμήματα</p>
              {VISIBILITY.map((v) => (
                <div key={v.key} className="flex items-start justify-between gap-4">
                  <div>
                    <Label htmlFor={`vis-${v.key}`}>{v.label}</Label>
                    <p className="text-xs text-muted-foreground">{v.hint}</p>
                  </div>
                  <Switch id={`vis-${v.key}`} checked={theme[v.key]} onCheckedChange={(val) => patch({ [v.key]: val } as Partial<PdfTheme>)} />
                </div>
              ))}
              {theme.showSignatureBox ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="sig0">Λεζάντα 1</Label>
                    <Input id="sig0" maxLength={40} value={theme.signatureLabels[0]} onChange={(e) => patch({ signatureLabels: [e.target.value, theme.signatureLabels[1]] })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="sig1">Λεζάντα 2</Label>
                    <Input id="sig1" maxLength={40} value={theme.signatureLabels[1]} onChange={(e) => patch({ signatureLabels: [theme.signatureLabels[0], e.target.value] })} />
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Όροι & σημειώσεις</CardTitle>
            <CardDescription>
              Εκτυπώνονται στο κάτω μέρος κάθε παραστατικού (π.χ. όροι πληρωμής, τόκοι υπερημερίας, επιφύλαξη κυριότητας). Κάθε σειρά μπορεί να ορίσει δικούς της όρους από την καρτέλα «Σειρές», που
              υπερισχύουν αυτών.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={theme.terms}
              maxLength={2000}
              rows={5}
              onChange={(e) => patch({ terms: e.target.value })}
              placeholder="π.χ. Η εξόφληση γίνεται εντός 30 ημερών από την έκδοση. Μετά την παρέλευση της προθεσμίας οφείλεται ο νόμιμος τόκος υπερημερίας."
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{theme.terms.length}/2000</p>
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => {
                setTheme(DEFAULT_PDF_THEME);
                setHexText(DEFAULT_PDF_THEME.accentColor);
              }}
            >
              <RotateCcw data-icon="inline-start" /> Επαναφορά προεπιλογών
            </Button>
            <Button type="button" onClick={save} disabled={pending || !dirty}>
              {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
              Αποθήκευση εμφάνισης
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Card className="xl:sticky xl:top-4 xl:self-start">
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Ζωντανή προεπισκόπηση</CardTitle>
            <CardDescription>Το τελευταίο εκδοθέν παραστατικό σας (ή δείγμα) με τις τρέχουσες ρυθμίσεις – πριν αποθηκεύσετε.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={previewUrl} target="_blank" rel="noreferrer">
              <ExternalLink data-icon="inline-start" /> Νέο παράθυρο
            </a>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border bg-neutral-200">
            <iframe key={previewUrl} title="Προεπισκόπηση παραστατικού" src={previewUrl} className="h-[55vh] min-h-[380px] w-full bg-neutral-200 sm:h-[70vh] sm:min-h-[560px]" />
          </div>
          {dirty ? <p className="mt-2 text-xs text-amber-700">Υπάρχουν μη αποθηκευμένες αλλαγές – η προεπισκόπηση τις δείχνει, τα PDF όχι ακόμη.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function TemplateThumb({ id, accent }: { id: string; accent: string }) {
  const modern = id === "modern";
  const minimal = id === "minimal";
  const bold = id === "bold";
  const elegant = id === "elegant";
  const rule = minimal ? "#e5e5e5" : elegant ? "#a3a3a3" : modern || bold ? accent : "#171717";
  const filled = modern || bold;
  return (
    <div className={cn("relative aspect-[4/3] w-full overflow-hidden rounded border bg-white", modern ? "p-0" : "p-2", bold && "pl-3")} aria-hidden>
      {bold ? <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} /> : null}
      <div className="flex h-full flex-col gap-1">
        {modern ? (
          <div className="flex justify-between p-2" style={{ backgroundColor: accent }}><div className="h-1 w-1/3 rounded-sm bg-white/80" /><div className="h-1 w-1/5 rounded-sm bg-white/80" /></div>
        ) : elegant ? (
          <div className="mx-auto mt-1 h-1 w-1/3 rounded-sm" style={{ backgroundColor: "#171717" }} />
        ) : (
          <div className={cn("rounded-sm", bold ? "h-2 w-1/2" : "h-1 w-1/3")} style={{ backgroundColor: minimal || bold ? accent : "#171717" }} />
        )}
        <div className={cn("px-2", modern && "mt-1")}>
          {!modern && !minimal ? <div className="mt-1 h-px" style={{ backgroundColor: rule }} /> : null}
          <div className={cn("mt-1 h-1 rounded-sm bg-neutral-200", elegant ? "mx-auto w-2/3" : "w-3/4")} />
          <div className={cn("mt-1 h-1 rounded-sm bg-neutral-200", elegant ? "mx-auto w-1/2" : "w-2/3")} />
          <div className="mt-1.5 h-1.5 w-full rounded-sm" style={{ backgroundColor: filled ? accent : minimal ? "#f0f0f0" : "transparent", borderBottom: filled || minimal ? "none" : `1px solid ${rule}` }} />
          <div className={cn("mt-1 h-1 w-full rounded-sm", minimal ? "bg-neutral-100" : "bg-neutral-200")} />
          <div className="h-1 w-full rounded-sm bg-white" />
          <div className={cn("h-1 w-full rounded-sm", minimal ? "bg-neutral-100" : "bg-neutral-200")} />
        </div>
        <div className="mt-auto ml-auto mr-2 mb-1 h-1.5 w-1/3 rounded-sm" style={{ backgroundColor: modern || minimal || bold ? accent : "#171717" }} />
      </div>
    </div>
  );
}
