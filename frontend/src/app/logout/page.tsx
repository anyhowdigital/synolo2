import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function LogoutPage() {
  try {
    await logoutAction();
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
  }
  redirect("/login");
}
