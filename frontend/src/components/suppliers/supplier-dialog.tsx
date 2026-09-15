"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteSupplierAction, saveSupplierAction } from "@/app/actions/suppliers";
import type { ActionResult } from "@/app/actions/customers";
import type { Supplier } from "@/db/schema";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AfmInput } from "@/components/afm-input";
import { TagInput } from "@/components/tags/tag-input";
import { parseTags } from "@/lib/services/custom-fields";
import { EXPENSE_CLASSIFICATION_CATEGORIES, EXPENSE_CLASSIFICATION_TYPES } from "@/lib/services/expense-labels";

const COUNTRIES: [string, string][] = [
  ["GR", "Ελλάδα"],
  ["CY", "Κύπρος"],
  ["DE", "Γερμανία"],
  ["IT", "Ιταλία"],
  ["FR", "Γαλλία"],
  ["ES", "Ισπανία"],
  ["NL", "Ολλανδία"],
  ["BG", "Βουλγαρία"],
  ["RO", "Ρουμανία"],
  ["GB", "Ην. Βασίλειο"],
  ["US", "ΗΠΑ"],
  ["CN", "Κίνα"],
];

const NONE = "__none__";

export function SupplierDialog({ supplier, trigger, tagSuggestions = [] }: { supplier?: Supplier; trigger?: ReactNode; tagSuggestions?: string[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await saveSupplierAction(prev, fd);
    if (res.ok) {
      toast.success(supplier ? "Ο προμηθευτής ενημερώθηκε." : "Ο προμηθευτής δημιουργήθηκε.");
      setOpen(false);
      if (!supplier && res.id) router.push(`/suppliers/${res.id}`);
    }
    return res;
  }, null);
  const [country, setCountry] = useState(supplier?.country ?? "GR");
  const [category, setCategory] = useState(supplier?.defaultClassificationCategory || NONE);
  const [type, setType] = useState(supplier?.defaultClassificationType || NONE);
  const [active, setActive] = useState(supplier?.active ?? true);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ??
          (supplier ? (
            <Button variant="outline">
              <Pencil data-icon="inline-start" /> Επεξεργασία
            </Button>
          ) : (
            <Button>
              <Plus data-icon="inline-start" /> Νέος προμηθευτής
            </Button>
          ))}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{supplier ? "Επεξεργασία προμηθευτή" : "Νέος προμηθευτής"}</DialogTitle>
          <DialogDescription>Στοιχεία τιμολόγησης, όροι πληρωμής και προεπιλεγμένος χαρακτηρισμός εξόδων για τα παραστατικά του προμηθευτή.</DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="grid gap-4">
          {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
          <input type="hidden" name="country" value={country} />
          <input type="hidden" name="defaultClassificationCategory" value={category === NONE ? "" : category} />
          <input type="hidden" name="defaultClassificationType" value={type === NONE ? "" : type} />
          <input type="hidden" name="active" value={active ? "on" : "off"} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="sup-name">Επωνυμία *</Label>
              <Input id="sup-name" name="name" defaultValue={supplier?.name ?? ""} required autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-afm">{country === "GR" ? "ΑΦΜ" : "VAT ID"}</Label>
              <AfmInput id="sup-afm" name="afm" defaultValue={supplier?.afm ?? ""} validate={country === "GR"} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-doy">ΔΟΥ</Label>
              <Input id="sup-doy" name="doy" defaultValue={supplier?.doy ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label>Χώρα</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-terms">Ημέρες πίστωσης</Label>
              <Input id="sup-terms" name="paymentTermsDays" type="number" min={0} max={365} defaultValue={supplier?.paymentTermsDays ?? ""} placeholder="π.χ. 30" />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="sup-address">Διεύθυνση</Label>
              <Input id="sup-address" name="address" defaultValue={supplier?.address ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-city">Πόλη</Label>
              <Input id="sup-city" name="city" defaultValue={supplier?.city ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-postal">Τ.Κ.</Label>
              <Input id="sup-postal" name="postalCode" defaultValue={supplier?.postalCode ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-email">Email</Label>
              <Input id="sup-email" name="email" type="email" defaultValue={supplier?.email ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-phone">Τηλέφωνο</Label>
              <Input id="sup-phone" name="phone" defaultValue={supplier?.phone ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-contact">Υπεύθυνος επικοινωνίας</Label>
              <Input id="sup-contact" name="contactPerson" defaultValue={supplier?.contactPerson ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label>Ετικέτες</Label>
              <TagInput name="tags" defaultValue={parseTags(supplier?.tags)} suggestions={tagSuggestions} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-iban">IBAN προμηθευτή</Label>
              <Input id="sup-iban" name="iban" defaultValue={supplier?.iban ?? ""} className="font-mono" placeholder="GR.." />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sup-bank">Τράπεζα</Label>
              <Input id="sup-bank" name="bankName" defaultValue={supplier?.bankName ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label>Προεπιλεγμένη κατηγορία εξόδου</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Χωρίς προεπιλογή —</SelectItem>
                  {EXPENSE_CLASSIFICATION_CATEGORIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Προεπιλεγμένος τύπος Ε3</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Χωρίς προεπιλογή —</SelectItem>
                  {EXPENSE_CLASSIFICATION_TYPES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} – {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="sup-notes">Σημειώσεις</Label>
              <Textarea id="sup-notes" name="notes" rows={3} defaultValue={supplier?.notes ?? ""} placeholder="Εσωτερικές σημειώσεις (όροι, επαφές, συμφωνίες)." />
            </div>
            {supplier ? (
              <label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm sm:col-span-2">
                <span>
                  Ενεργός προμηθευτής
                  <span className="block text-xs text-muted-foreground">Οι ανενεργοί δεν εμφανίζονται στις επιλογές νέων παραστατικών.</span>
                </span>
                <Switch checked={active} onCheckedChange={setActive} />
              </label>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">Τα παραστατικά με το ίδιο ΑΦΜ (και όσα έρθουν από το myDATA) συνδέονται αυτόματα με την καρτέλα και παίρνουν την προθεσμία πληρωμής και τον προεπιλεγμένο χαρακτηρισμό.</p>
          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Άκυρο
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Αποθήκευση
            </Button>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteSupplierButton({ id, hasExpenses }: { id: string; hasExpenses: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-destructive">
          <Trash2 data-icon="inline-start" /> Διαγραφή
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Διαγραφή προμηθευτή;</DialogTitle>
          <DialogDescription>
            {hasExpenses ? "Τα παραστατικά αγορών του προμηθευτή δεν διαγράφονται – απλώς αποσυνδέονται από την καρτέλα." : "Η ενέργεια δεν αναιρείται."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Άκυρο
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteSupplierAction(id);
                if (res.ok) {
                  toast.success("Ο προμηθευτής διαγράφηκε.");
                  router.push("/suppliers");
                } else toast.error(res.error);
              })
            }
          >
            Διαγραφή
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
