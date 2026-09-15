"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PREFIX = "tc-dismissed:";
const listeners = new Set<() => void>();

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isDismissed(key: string) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PREFIX + key) === todayKey();
  } catch {
    return false;
  }
}

function dismiss(key: string) {
  try {
    window.localStorage.setItem(PREFIX + key, todayKey());
  } catch {
    // Ιδιωτική περιήγηση / απενεργοποιημένο storage: απλώς δεν θυμόμαστε την απόκρυψη.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Περιτύλιγμα ειδοποίησης που ο χρήστης μπορεί να κρύψει για την υπόλοιπη ημέρα.
 * Το `storageKey` πρέπει να αλλάζει όταν αλλάζει η ουσία της ειδοποίησης (π.χ. περιλαμβάνει πλήθος),
 * ώστε νέα εκκρεμότητα να εμφανίζεται ξανά.
 */
export function DismissibleAlert({ storageKey, children, className }: { storageKey: string; children: ReactNode; className?: string }) {
  const hidden = useSyncExternalStore(
    subscribe,
    () => isDismissed(storageKey),
    () => false,
  );
  if (hidden) return null;
  return (
    <div className={cn("relative", className)}>
      {children}
      <Button variant="ghost" size="icon-sm" className="absolute right-2 top-2 text-current/70 hover:text-current" aria-label="Απόκρυψη για σήμερα" title="Απόκρυψη για σήμερα" onClick={() => dismiss(storageKey)}>
        <X />
      </Button>
    </div>
  );
}
