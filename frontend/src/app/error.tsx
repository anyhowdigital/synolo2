"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const RELOAD_KEY = "tc-chunk-reload";

function isChunkLoadError(error: Error) {
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(`${error.name} ${error.message}`);
}

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Μετά από νέο deployment τα παλιά chunks δεν υπάρχουν πια· μία αυτόματη ανανέωση φορτώνει τη νέα έκδοση.
    if (isChunkLoadError(error) && sessionStorage.getItem(RELOAD_KEY) !== "1") {
      sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
      return;
    }
    sessionStorage.removeItem(RELOAD_KEY);
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <div className="grid gap-1">
        <h1 className="text-lg font-semibold">Κάτι πήγε στραβά</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Η σελίδα δεν μπόρεσε να φορτώσει. Δοκιμάστε ξανά· αν το πρόβλημα επιμένει, ανανεώστε τη σελίδα ή επικοινωνήστε με την υποστήριξη.
        </p>
        {error.digest ? <p className="text-xs text-muted-foreground">Κωδικός αναφοράς: {error.digest}</p> : null}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>
          <RotateCcw data-icon="inline-start" /> Δοκιμή ξανά
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Ανανέωση σελίδας
        </Button>
      </div>
    </div>
  );
}
