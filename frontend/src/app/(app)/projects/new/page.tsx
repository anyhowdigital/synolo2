import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { projects, customers } from "@/db/schema";
import { requireContext } from "@/lib/services/org";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/components/projects/project-form";

export default async function EditProjectPage({ params }: { params?: Promise<{ id?: string }> }) {
  const resolved = params ? await params : ({} as { id?: string });
  const id = resolved?.id;
  const db = await getDb();
  const { org } = await requireContext(db);
  const isNew = !id || id === "new";
  const project = isNew ? null : await db.query.projects.findFirst({ where: and(eq(projects.id, id!), eq(projects.orgId, org.id)) });
  if (!isNew && !project) notFound();
  const custs = await db.select().from(customers).where(eq(customers.orgId, org.id)).orderBy(desc(customers.createdAt));
  return (
    <>
      <PageHeader title={isNew ? "Νέο έργο" : `Επεξεργασία: ${project!.name}`}>
        <Button asChild variant="ghost">
          <Link href={isNew ? "/projects" : `/projects/${id}`}>
            <ArrowLeft className="size-4" /> Επιστροφή
          </Link>
        </Button>
      </PageHeader>
      <ProjectForm project={project ?? undefined} customers={custs.map((c) => ({ id: c.id, name: c.name }))} />
    </>
  );
}
