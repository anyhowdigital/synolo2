"use client";

import { useTransition } from "react";
import Link from "next/link";
import { MailWarning } from "lucide-react";
import { toast } from "sonner";
import { resendVerificationAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function VerifyEmailBanner({ email }: { email: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm text-amber-950 print:hidden dark:bg-amber-950/30 dark:text-amber-100">
      <MailWarning className="size-4 shrink-0" />
      <span className="flex-1">
        Επαληθεύστε το email <strong>{email}</strong> για να ενεργοποιηθούν πλήρως οι ειδοποιήσεις και η αποστολή παραστατικών από τον λογαριασμό σας.
      </span>
      <Button
        size="xs"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await resendVerificationAction();
            if (res.ok) toast.success("Στάλθηκε νέο email επαλήθευσης.");
            else toast.error(res.error);
          })
        }
      >
        Επαναποστολή
      </Button>
      <Button asChild size="xs" variant="ghost">
        <Link href="/account">Λογαριασμός</Link>
      </Button>
    </div>
  );
}
