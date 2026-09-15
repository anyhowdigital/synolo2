import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getCurrentContext } from "@/lib/auth/session";
import { SynoloLanding } from "@/components/marketing/landing";

export const metadata = {
  title: { absolute: "Σύνολο ERP — Εμπορική διαχείριση και λογιστικό γραφείο. Μαζί." },
  description: "Από την πρώτη πώληση μέχρι την εικόνα των βιβλίων σας. Τιμολόγηση, myDATA, B2G, αποθήκη, AI, εισπράξεις και ξεχωριστή πύλη λογιστικού γραφείου στο Σύνολο ERP.",
};

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const db = await getDb();
  if (sp.preview !== "1" && await getCurrentContext(db)) redirect("/dashboard");
  return <SynoloLanding />;
}
