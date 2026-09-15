import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Η σελίδα δεν βρέθηκε" };

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileQuestion className="size-6" />
      </div>
      <div className="grid gap-1">
        <h1 className="text-lg font-semibold">Η σελίδα δεν βρέθηκε</h1>
        <p className="max-w-md text-sm text-muted-foreground">Ο σύνδεσμος μπορεί να είναι λανθασμένος ή η εγγραφή να έχει διαγραφεί.</p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/dashboard">Επισκόπηση</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Αρχική</Link>
        </Button>
      </div>
    </div>
  );
}
