"use client";

import { ActionForm } from "@/components/ui/action-form";
import { useActionState, useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { saveProduct } from "@/app/actions/products";
import type { ActionResult } from "@/app/actions/customers";
import type { Product } from "@/db/schema";
import { VAT_CATEGORIES, VAT_EXEMPTION_REASONS } from "@/lib/greek/vat";
import { INCOME_CLASSIFICATION_CATEGORIES, INCOME_CLASSIFICATION_TYPES, MEASUREMENT_UNITS } from "@/lib/greek/classifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TagInput } from "@/components/tags/tag-input";
import { CustomFieldInputs } from "@/components/custom-fields/custom-field-inputs";
import { parseCustomFieldValues, parseTags, type CustomFieldDef } from "@/lib/services/custom-fields";

export interface ProductDialogExtras {
  defs: CustomFieldDef[];
  tagSuggestions: string[];
  categories: string[];
}

export function ProductDialog({ product, extras }: { product?: Product; extras?: ProductDialogExtras }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await saveProduct(prev, fd);
    if (res.ok) {
      toast.success(product ? "Το είδος ενημερώθηκε." : "Το είδος δημιουργήθηκε.");
      setOpen(false);
    }
    return res;
  }, null);
  const [kind, setKind] = useState(product?.kind ?? "service");
  const [vat, setVat] = useState(String(product?.vatCategory ?? 1));
  const [exemption, setExemption] = useState(String(product?.vatExemptionCategory ?? ""));
  const [unit, setUnit] = useState(String(product?.measurementUnit ?? (product?.kind === "product" ? 1 : 7)));
  const [cat, setCat] = useState(product?.classificationCategory ?? "category1_3");
  const [type, setType] = useState(product?.classificationType ?? "E3_561_001");
  const [trackStock, setTrackStock] = useState(product?.trackStock ?? false);

  const onKindChange = (v: string) => {
    setKind(v);
    if (!product) {
      setUnit(v === "product" ? "1" : "7");
      setCat(v === "product" ? "category1_1" : "category1_3");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {product ? (
          <Button variant="ghost" size="icon-sm" aria-label="Επεξεργασία">
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus data-icon="inline-start" /> Νέο είδος
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? "Επεξεργασία είδους" : "Νέο είδος / υπηρεσία"}</DialogTitle>
          <DialogDescription>Οι ρυθμίσεις ΦΠΑ και χαρακτηρισμού myDATA προ-συμπληρώνονται στις γραμμές των παραστατικών.</DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="grid gap-4">
          {product ? <input type="hidden" name="id" value={product.id} /> : null}
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="vatCategory" value={vat} />
          <input type="hidden" name="vatExemptionCategory" value={vat === "7" ? exemption : ""} />
          <input type="hidden" name="measurementUnit" value={unit} />
          <input type="hidden" name="classificationCategory" value={cat} />
          <input type="hidden" name="classificationType" value={type} />
          <input type="hidden" name="trackStock" value={trackStock ? "true" : "false"} />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-2">
              <Label>Τύπος</Label>
              <Select value={kind} onValueChange={onKindChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Υπηρεσία</SelectItem>
                  <SelectItem value="product">Εμπόρευμα / Προϊόν</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sku">Κωδικός (SKU)</Label>
              <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} placeholder="π.χ. SRV-001" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="barcode">Barcode (EAN/UPC)</Label>
              <Input id="barcode" name="barcode" defaultValue={product?.barcode ?? ""} placeholder="Σαρώστε ή πληκτρολογήστε" className="font-mono" maxLength={64} inputMode="numeric" />
            </div>
            <div className="grid gap-2">
              <Label>Μονάδα μέτρησης</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEASUREMENT_UNITS.map((u) => (
                    <SelectItem key={u.code} value={String(u.code)}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="name">Περιγραφή *</Label>
            <Input id="name" name="name" required defaultValue={product?.name ?? ""} placeholder="Όπως θα εμφανίζεται στο παραστατικό" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Αναλυτική περιγραφή</Label>
            <Textarea id="description" name="description" rows={2} defaultValue={product?.description ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="category">Κατηγορία</Label>
              <Input id="category" name="category" list="product-categories" defaultValue={product?.category ?? ""} placeholder="π.χ. Υπηρεσίες, Αναλώσιμα" maxLength={60} />
              <datalist id="product-categories">
                {(extras?.categories ?? []).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-2">
              <Label>Ετικέτες</Label>
              <TagInput name="tags" defaultValue={parseTags(product?.tags)} suggestions={extras?.tagSuggestions ?? []} />
            </div>
          </div>
          {extras?.defs.length ? <CustomFieldInputs defs={extras.defs} defaultValues={parseCustomFieldValues(product?.customFieldsJson)} /> : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="unitPrice">Τιμή μονάδας (καθαρή) €</Label>
              <Input id="unitPrice" name="unitPrice" type="number" step="0.01" min={0} required defaultValue={product?.unitPrice ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="costPrice">Κόστος αγοράς €</Label>
              <Input id="costPrice" name="costPrice" type="number" step="0.01" min={0} defaultValue={product?.costPrice ?? 0} />
            </div>
            <div className="grid gap-2">
              <Label>Κατηγορία ΦΠΑ</Label>
              <Select value={vat} onValueChange={setVat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAT_CATEGORIES.map((v) => (
                    <SelectItem key={v.code} value={String(v.code)}>
                      {v.label} – {v.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {vat === "7" ? (
            <div className="grid gap-2">
              <Label>Αιτία εξαίρεσης ΦΠΑ *</Label>
              <Select value={exemption} onValueChange={setExemption}>
                <SelectTrigger>
                  <SelectValue placeholder="Επιλέξτε άρθρο απαλλαγής" />
                </SelectTrigger>
                <SelectContent>
                  {VAT_EXEMPTION_REASONS.map((r) => (
                    <SelectItem key={r.code} value={String(r.code)}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Κατηγορία χαρακτηρισμού (myDATA)</Label>
              <Select value={cat} onValueChange={setCat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INCOME_CLASSIFICATION_CATEGORIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Τύπος χαρακτηρισμού (Ε3)</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INCOME_CLASSIFICATION_TYPES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} – {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {kind === "product" ? (
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Παρακολούθηση αποθέματος</Label>
                  <p className="text-xs text-muted-foreground">Πωλήσεις και αγορές κινούν το απόθεμα αυτόματα · αποτίμηση με μέσο σταθμικό κόστος.</p>
                </div>
                <Switch checked={trackStock} onCheckedChange={setTrackStock} />
              </div>
              {trackStock ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="stockQuantity">{product?.trackStock ? "Απόθεμα (σύνολο αποθηκών)" : "Αρχικό απόθεμα"}</Label>
                    <Input id="stockQuantity" name="stockQuantity" type="number" step="0.001" defaultValue={product?.stockQuantity ?? 0} />
                    <p className="text-[11px] text-muted-foreground">{product?.trackStock ? "Αλλαγή εδώ καταχωρεί κίνηση «Διόρθωση» στην προεπιλεγμένη αποθήκη." : "Καταχωρείται ως κίνηση «Απογραφή έναρξης» με το κόστος αγοράς."}</p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="reorderLevel">Όριο επαναπαραγγελίας</Label>
                    <Input id="reorderLevel" name="reorderLevel" type="number" step="0.01" defaultValue={product?.reorderLevel ?? 0} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Αποθήκευση
            </Button>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
