"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export const THEME_STORAGE_KEY = "tc-theme";

/**
 * Εκτελείται πριν το hydration ώστε να μην αναβοσβήνει το θέμα: εφαρμόζει την αποθηκευμένη
 * επιλογή ή την προτίμηση του συστήματος.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => null,
  );

  const toggle = () => {
    const next = !dark;
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* private mode */
    }
  };

  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={dark ? "Φωτεινό θέμα" : "Σκούρο θέμα"} title={dark ? "Φωτεινό θέμα" : "Σκούρο θέμα"}>
      {dark === null ? <Sun className="opacity-0" /> : dark ? <Sun /> : <Moon />}
    </Button>
  );
}
