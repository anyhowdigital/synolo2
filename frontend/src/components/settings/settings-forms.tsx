"use client";

import { ActionForm } from "@/components/ui/action-form";
import { AfmInput } from "@/components/afm-input";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ImageIcon, Loader2, Plus, PlugZap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveCompany, saveInvoicingPrefs, saveMyData, saveSeries, testMyDataConnectionAction, toggleSeries } from "@/app/actions/settings";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/app/actions/customers";
import type { Organization, Series } from "@/db/schema";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_GROUPS } from "@/lib/greek/document-types";
import { DOY_LIST } from "@/lib/greek/afm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function useToastOnResult(state: ActionResult | null, successMessage: string) {
  useEffect(() => {
    if (state?.ok) toast.success(successMessage);
  }, [state, successMessage]);
}

function LogoUpload({ current }: { current: string | null }) {
  const [preview, setPreview] = useState<string | null>(current);
  const [value, setValue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 300_000) {
      toast.error("Το αρχείο είναι πολύ μεγάλο (μέγιστο 300KB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setPreview(url);
      setValue(url);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid gap-2 sm:col-span-2">
      <Label>Λογότυπο (εικόνα)</Label>
      <input type="hidden" name="logoDataUrl" value={value} />
      <div className="flex flex-wrap items-center gap-4 rounded-lg border p-3">
        <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded bg-muted">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Λογότυπο" className="max-h-16 max-w-32 object-contain" />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            Επιλογή εικόνας
          </Button>
          {preview ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPreview(null);
                setValue("__remove");
              }}
            >
              <Trash2 data-icon="inline-start" /> Αφαίρεση
            </Button>
          ) : null}
          <p className="basis-full text-xs text-muted-foreground">PNG, JPEG, WebP ή SVG έως 300KB. Εμφανίζεται στην κεφαλίδα των παραστατικών και στη δημόσια σελίδα πελάτη.</p>
        </div>
      </div>
    </div>
  );
}

export function CompanyForm({ org }: { org: Organization }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveCompany, null);
  useToastOnResult(state, "Τα στοιχεία της επιχείρησης αποθηκεύτηκαν.");
  return (
    <ActionForm action={action}>
      <Card>
        <CardHeader>
          <CardTitle>Στοιχεία επιχείρησης (εκδότη)</CardTitle>
          <CardDescription>Εμφανίζονται στα παραστατικά και αποστέλλονται ως «issuer» στο myDATA.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Διακριτικός τίτλος *" name="name" defaultValue={org.name} required />
          <Field label="Επωνυμία (νομική)" name="legalName" defaultValue={org.legalName ?? ""} />
          <div className="grid gap-2">
            <Label htmlFor="afm">ΑΦΜ *</Label>
            <AfmInput id="afm" name="afm" defaultValue={org.afm} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doy">ΔΟΥ</Label>
            <Input id="doy" name="doy" list="org-doy" defaultValue={org.doy ?? ""} />
            <datalist id="org-doy">
              {DOY_LIST.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
          <Field label="Δραστηριότητα / Επάγγελμα" name="activity" defaultValue={org.activity ?? ""} className="sm:col-span-2" />
          <Field label="Αρ. ΓΕΜΗ" name="gemi" defaultValue={org.gemi ?? ""} />
          <Field label="Λογότυπο (κείμενο)" name="logoText" defaultValue={org.logoText ?? ""} />
          <LogoUpload current={org.logoDataUrl} />
          <Field label="Διεύθυνση" name="address" defaultValue={org.address ?? ""} className="sm:col-span-2" />
          <Field label="Πόλη" name="city" defaultValue={org.city ?? ""} />
          <Field label="Τ.Κ." name="postalCode" defaultValue={org.postalCode ?? ""} />
          <Field label="Email" name="email" type="email" defaultValue={org.email ?? ""} />
          <Field label="Τηλέφωνο" name="phone" defaultValue={org.phone ?? ""} />
          <Field label="Ιστοσελίδα" name="website" defaultValue={org.website ?? ""} />
          <Field label="Προεπιλεγμένοι όροι πληρωμής (ημέρες)" name="defaultPaymentTermsDays" type="number" defaultValue={String(org.defaultPaymentTermsDays)} />
          <Field label="IBAN" name="iban" defaultValue={org.iban ?? ""} />
          <Field label="Τράπεζα" name="bankName" defaultValue={org.bankName ?? ""} />
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="invoiceFooter">Υποσέλιδο παραστατικών</Label>
            <Textarea id="invoiceFooter" name="invoiceFooter" rows={2} defaultValue={org.invoiceFooter ?? ""} />
          </div>
          {state && !state.ok ? (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Αποθήκευση
          </Button>
        </CardFooter>
      </Card>
    </ActionForm>
  );
}

export function MyDataForm({ org }: { org: Organization }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveMyData, null);
  const [env, setEnv] = useState(org.mydataEnvironment);
  const [testing, startTest] = useTransition();
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useToastOnResult(state, "Οι ρυθμίσεις myDATA αποθηκεύτηκαν.");
  const runTest = () => {
    const fd = new FormData(formRef.current ?? undefined);
    setTestResult(null);
    startTest(async () => {
      const res = await testMyDataConnectionAction({
        environment: env,
        userId: String(fd.get("mydataUserId") ?? ""),
        subscriptionKey: String(fd.get("mydataSubscriptionKey") ?? ""),
      });
      setTestResult(res.ok ? { ok: true, message: res.warning ?? "Επιτυχής σύνδεση." } : { ok: false, message: res.error });
    });
  };
  return (
    <ActionForm ref={formRef} action={action}>
      <input type="hidden" name="mydataEnvironment" value={env} />
      <Card>
        <CardHeader>
          <CardTitle>Διασύνδεση myDATA (ΑΑΔΕ)</CardTitle>
          <CardDescription>
            Τα διαπιστευτήρια εκδίδονται από το myAADE → Εφαρμογές → myDATA → «Εγγραφή στο myDATA REST API». Χρειάζεστε χωριστά κλειδιά για δοκιμαστικό και παραγωγικό περιβάλλον.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Περιβάλλον</Label>
            <Select value={env} onValueChange={setEnv}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mock">Προσομοίωση – χωρίς αποστολή στην ΑΑΔΕ (για εκπαίδευση/επίδειξη)</SelectItem>
                <SelectItem value="dev">Δοκιμαστικό – mydataapidev.aade.gr</SelectItem>
                <SelectItem value="prod">Παραγωγή – mydatapi.aade.gr</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {env === "prod" ? (
            <Alert>
              <AlertTitle>Παραγωγικό περιβάλλον</AlertTitle>
              <AlertDescription>Κάθε διαβίβαση δημιουργεί πραγματικό MARK στα βιβλία της επιχείρησης. Δοκιμάστε πρώτα στο δοκιμαστικό περιβάλλον.</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="aade-user-id" name="mydataUserId" defaultValue={org.mydataUserId ?? ""} autoComplete="off" disabled={env === "mock"} />
            <Field label="ocp-apim-subscription-key" name="mydataSubscriptionKey" type="password" defaultValue={org.mydataSubscriptionKey ?? ""} autoComplete="off" disabled={env === "mock"} />
          </div>
          {env !== "mock" ? (
            <p className="text-xs text-muted-foreground">
              Το aade-user-id είναι το όνομα χρήστη που δηλώσατε στην «Εγγραφή στο myDATA REST API» (όχι οι κωδικοί TAXISnet). Το subscription key είναι διαφορετικό για δοκιμαστικό και παραγωγή· αν το
              περιβάλλον δεν ταιριάζει με το κλειδί, η ΑΑΔΕ απαντά με HTTP 403 και κενό σώμα.
            </p>
          ) : null}
          {testResult ? (
            <Alert variant={testResult.ok ? "default" : "destructive"}>
              <AlertTitle>{testResult.ok ? "Η σύνδεση λειτουργεί" : "Ο έλεγχος σύνδεσης απέτυχε"}</AlertTitle>
              <AlertDescription className="break-words">{testResult.message}</AlertDescription>
            </Alert>
          ) : null}
          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-2">
          <p className="text-xs text-muted-foreground">Υποστηρίζονται SendInvoices, CancelInvoice, RequestDocs και RequestTransmittedDocs. Οι διαβιβάσεις καταγράφονται με πλήρες XML αιτήματος/απάντησης.</p>
          <div className="flex gap-2">
            {env !== "mock" ? (
              <Button type="button" variant="outline" onClick={runTest} disabled={testing}>
                {testing ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <PlugZap data-icon="inline-start" />}
                Έλεγχος σύνδεσης
              </Button>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Αποθήκευση
            </Button>
          </div>
        </CardFooter>
      </Card>
    </ActionForm>
  );
}

export function InvoicingPrefsForm({ org }: { org: Organization }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveInvoicingPrefs, null);
  useToastOnResult(state, "Οι προτιμήσεις τιμολόγησης αποθηκεύτηκαν.");
  return (
    <ActionForm action={action}>
      <Card>
        <CardHeader>
          <CardTitle>Προτιμήσεις τιμολόγησης</CardTitle>
          <CardDescription>Αυτοματισμοί έκδοσης, αρίθμηση και υπενθυμίσεις πληρωμής.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <label className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div>
              <div className="font-medium">Αυτόματη διαβίβαση στο myDATA</div>
              <p className="text-sm text-muted-foreground">Κάθε παραστατικό διαβιβάζεται στην ΑΑΔΕ αμέσως μετά την έκδοση, χωρίς επιπλέον κλικ. Οι προσφορές δεν διαβιβάζονται ποτέ.</p>
            </div>
            <Switch name="autoTransmit" defaultChecked={org.autoTransmit} />
          </label>
          <label className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div>
              <div className="font-medium">Ετήσια επανεκκίνηση αρίθμησης</div>
              <p className="text-sm text-muted-foreground">Κάθε σειρά ξεκινά από το 1 την 1η Ιανουαρίου. Αν είναι ανενεργό, η αρίθμηση είναι συνεχής (προεπιλογή ΕΛΠ).</p>
            </div>
            <Switch name="yearlyNumbering" defaultChecked={org.yearlyNumbering} />
          </label>
          <label className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div>
              <div className="font-medium">Online πληρωμή από τη δημόσια σελίδα</div>
              <p className="text-sm text-muted-foreground">
                Ο πελάτης βλέπει κουμπί «Πληρωμή με κάρτα» στον σύνδεσμο του τιμολογίου. Η είσπραξη καταχωρείται αυτόματα (τρόπος πληρωμής POS / e-POS) και το παραστατικό εξοφλείται.
              </p>
            </div>
            <Switch name="onlinePayments" defaultChecked={org.onlinePayments} />
          </label>
          <div className="grid gap-2">
            <Label htmlFor="stripeAccountId">Stripe Connect λογαριασμός (προαιρετικό)</Label>
            <Input id="stripeAccountId" name="stripeAccountId" defaultValue={org.stripeAccountId ?? ""} placeholder="acct_…" className="max-w-xs font-mono" />
            <p className="text-xs text-muted-foreground">
              Αν συμπληρωθεί, τα ποσά των online πληρωμών μεταφέρονται απευθείας στον δικό σας λογαριασμό Stripe (transfer_data.destination). Χωρίς Stripe κλειδί στην πλατφόρμα, η πληρωμή γίνεται σε λειτουργία προσομοίωσης.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reminderDays">Στάδια υπενθυμίσεων πληρωμής (ημέρες ως προς τη λήξη)</Label>
            <Input id="reminderDays" name="reminderDays" defaultValue={org.reminderDays} placeholder="-3,0,7,21" className="max-w-xs" />
            <p className="text-xs text-muted-foreground">
              Αρνητικές τιμές = πριν τη λήξη. Π.χ. <code className="rounded bg-muted px-1">-3,0,7,21</code> στέλνει ευγενική υπενθύμιση 3 ημέρες πριν, ειδοποίηση την ημέρα λήξης, όχληση στις 7 ημέρες και τελική
              όχληση στις 21. Αφήστε κενό για απενεργοποίηση. Απαιτεί προγραμματισμένη κλήση του <code className="rounded bg-muted px-1">/api/cron/reminders</code>.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="lateInterestAnnualRate">Ετήσιο επιτόκιο υπερημερίας (%)</Label>
              <Input id="lateInterestAnnualRate" name="lateInterestAnnualRate" type="number" step="0.01" min="0" max="30" defaultValue={org.lateInterestAnnualRate} className="max-w-[160px]" />
              <p className="text-xs text-muted-foreground">0 = απενεργοποιημένο. Οι τόκοι υπολογίζονται αναλογικά με τις ημέρες καθυστέρησης και εμφανίζονται ενημερωτικά στο παραστατικό και στις υπενθυμίσεις.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lateFeeFlat">Πάγια χρέωση καθυστέρησης (€)</Label>
              <Input id="lateFeeFlat" name="lateFeeFlat" type="number" step="0.01" min="0" defaultValue={org.lateFeeFlat} className="max-w-[160px]" />
              <p className="text-xs text-muted-foreground">Εφαρμόζεται μία φορά ανά ληξιπρόθεσμο παραστατικό.</p>
            </div>
          </div>
          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Αποθήκευση
          </Button>
        </CardFooter>
      </Card>
    </ActionForm>
  );
}

export function SeriesCard({ seriesList }: { seriesList: Series[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Σειρές παραστατικών</CardTitle>
        <CardDescription>Κάθε σειρά αντιστοιχεί σε έναν τύπο myDATA και έχει ανεξάρτητη, συνεχή αρίθμηση.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Κωδικός</TableHead>
              <TableHead>Ονομασία</TableHead>
              <TableHead>Τύπος myDATA</TableHead>
              <TableHead className="text-right">Επόμενος αρ.</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {seriesList.map((s) => (
              <TableRow key={s.id} className={s.active ? "" : "opacity-50"}>
                <TableCell className="font-mono font-medium">{s.code}</TableCell>
                <TableCell>{s.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{s.invoiceType}</Badge> <span className="text-xs text-muted-foreground">{DOCUMENT_TYPES.find((d) => d.code === s.invoiceType)?.name}</span>
                  {s.branch ? <Badge variant="secondary" className="ml-1">Εγκ. {s.branch}{s.branchName ? ` · ${s.branchName}` : ""}</Badge> : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{s.nextNumber}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <SeriesDialog series={s} />
                    <Button variant="ghost" size="sm" onClick={() => toggleSeries(s.id)}>
                      {s.active ? "Απενεργοποίηση" : "Ενεργοποίηση"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter className="justify-end">
        <SeriesDialog />
      </CardFooter>
    </Card>
  );
}

function SeriesDialog({ series }: { series?: Series }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const res = await saveSeries(prev, fd);
    if (res.ok) {
      toast.success("Η σειρά αποθηκεύτηκε.");
      setOpen(false);
    }
    return res;
  }, null);
  const [type, setType] = useState(series?.invoiceType ?? "2.1");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {series ? (
          <Button variant="ghost" size="sm">
            Επεξεργασία
          </Button>
        ) : (
          <Button variant="outline">
            <Plus data-icon="inline-start" /> Νέα σειρά
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{series ? `Σειρά ${series.code}` : "Νέα σειρά"}</DialogTitle>
          <DialogDescription>Ο κωδικός σειράς αποστέλλεται στο πεδίο «series» του myDATA.</DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="grid gap-4">
          {series ? <input type="hidden" name="id" value={series.id} /> : null}
          <input type="hidden" name="invoiceType" value={type} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Κωδικός *" name="code" defaultValue={series?.code ?? ""} required maxLength={10} placeholder="π.χ. Α ή ΤΠΥ" />
            <Field label="Επόμενος αριθμός" name="nextNumber" type="number" defaultValue={String(series?.nextNumber ?? 1)} />
          </div>
          <Field label="Ονομασία *" name="name" defaultValue={series?.name ?? ""} required />
          <div className="grid gap-2">
            <Label>Τύπος παραστατικού myDATA</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPE_GROUPS.map((g) => (
                  <SelectGroup key={g.label}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {g.codes.map((code) => {
                      const d = DOCUMENT_TYPES.find((x) => x.code === code)!;
                      return (
                        <SelectItem key={d.code} value={d.code}>
                          {d.code} – {d.name}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <Field label="Εγκατάσταση (branch)" name="branch" type="number" min={0} defaultValue={String(series?.branch ?? 0)} />
            <Field label="Ονομασία υποκαταστήματος" name="branchName" defaultValue={series?.branchName ?? ""} placeholder="κενό = έδρα" />
          </div>
          <p className="text-xs text-muted-foreground">
            Ο αριθμός εγκατάστασης όπως έχει δηλωθεί στο Μητρώο ΑΑΔΕ (0 = έδρα). Αποστέλλεται στο πεδίο issuer.branch.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="series-terms">Όροι / σημειώσεις σειράς (εκτυπώνονται σε κάθε παραστατικό)</Label>
            <Textarea id="series-terms" name="termsText" rows={3} maxLength={2000} defaultValue={series?.termsText ?? ""} placeholder="π.χ. Οι τιμές ισχύουν για 30 ημέρες. Η παράδοση γίνεται εντός 5 εργάσιμων. Κενό = χρήση των γενικών όρων από «Εμφάνιση PDF»." />
          </div>
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
              Αποθήκευση
            </Button>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  name,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return (
    <div className={`grid gap-2 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
    </div>
  );
}
