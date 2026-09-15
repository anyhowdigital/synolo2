import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_INIT_SCRIPT } from "@/components/theme-toggle";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { OfflineQueueBanner } from "@/components/pwa/offline-queue-banner";
import "./globals.css";
import "@/components/marketing/public.css";

const notoSans = localFont({
  variable: "--font-sans",
  src: [
    { path: "../../public/fonts/NotoSans-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/NotoSans-Bold.ttf", weight: "700", style: "normal" },
  ],
});

/**
 * Όλες οι σελίδες εξαρτώνται από cookies/βάση· δεν πρέπει να προ-αποδίδονται (prerender) στο build,
 * αλλιώς το build στο Vercel ανοίγει σύνδεση με τη βάση παραγωγής και τρέχει migrations/seed από πολλούς workers.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Σύνολο ERP — Εμπορική διαχείριση και λογιστικό γραφείο",
    template: "%s · Σύνολο ERP",
  },
  description:
    "Ηλεκτρονική τιμολόγηση για ελληνικές επιχειρήσεις με αυτόματη διαβίβαση στο myDATA της ΑΑΔΕ, CRM πελατών, αποθήκη και συνδρομητική χρέωση.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Σύνολο ERP", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.svg", apple: "/icon-192.svg" },
};

export const viewport: Viewport = { themeColor: "#23645d" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="el" className={`${notoSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-right" richColors />
        <ServiceWorkerRegister />
        <OfflineQueueBanner />
      </body>
    </html>
  );
}
