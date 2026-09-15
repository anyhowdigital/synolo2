import { redirect } from "next/navigation";
import { currentSuperAdmin } from "@/lib/admin/auth";
import { adminLoginAction } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await currentSuperAdmin()) redirect("/admin");
  const sp = await searchParams;
  const err = sp.e === "1";
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Super-Admin</h1>
        <p className="text-sm text-muted-foreground">Εσωτερικό πάνελ διαχείρισης πλατφόρμας.</p>
      </div>
      {err ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="admin-login-error">Λάθος στοιχεία super-admin.</p> : null}
      <form action={adminLoginAction} className="grid gap-4" data-testid="admin-login-form">
        <div className="grid gap-1">
          <label htmlFor="email" className="text-sm">Email</label>
          <input id="email" name="email" type="email" required className="h-10 rounded-lg border bg-background px-3 text-sm" data-testid="admin-email" />
        </div>
        <div className="grid gap-1">
          <label htmlFor="password" className="text-sm">Κωδικός</label>
          <input id="password" name="password" type="password" required className="h-10 rounded-lg border bg-background px-3 text-sm" data-testid="admin-password" />
        </div>
        <button type="submit" className="h-10 rounded-lg bg-primary text-sm font-medium text-primary-foreground" data-testid="admin-login-btn">Είσοδος</button>
      </form>
    </div>
  );
}
