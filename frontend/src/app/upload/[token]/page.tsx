import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { docRequests, organizations } from "@/db/schema";
import { UploadForm } from "@/components/public/upload-form";

export const dynamic = "force-dynamic";

export default async function PublicUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const rows = await db.select().from(docRequests).where(eq(docRequests.token, token)).limit(1);
  const req = rows[0];

  if (!req || req.status === "closed" || req.expiresAt < new Date().toISOString()) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-16">
        <h1 className="text-xl font-medium">Ο σύνδεσμος δεν είναι πλέον ενεργός</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ζητήστε από τον λογιστή σας νέο σύνδεσμο ανεβάσματος.</p>
      </main>
    );
  }

  const org = (await db.select().from(organizations).where(eq(organizations.id, req.orgId)).limit(1))[0];
  const items = JSON.parse(req.itemsJson) as { label: string; uploaded: boolean }[];

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 py-12">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{org?.name ?? ""}</p>
      <h1 className="mt-1 text-2xl font-medium">{req.title}</h1>
      {req.message ? <p className="mt-2 text-sm text-muted-foreground">{req.message}</p> : null}
      <p className="mt-1 text-xs text-muted-foreground">Ο σύνδεσμος λήγει {new Date(req.expiresAt).toLocaleDateString("el-GR")}.</p>
      <UploadForm token={token} items={items} />
    </main>
  );
}
