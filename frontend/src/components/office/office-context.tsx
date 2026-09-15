"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActiveCompany } from "@/components/active-company";

export function OfficeContext({ clients, firmName }: { clients: { id: string; name: string; afm: string }[]; firmName: string }) {
  const pathname = usePathname();
  const id = pathname.match(/^\/office\/clients\/([^/]+)/)?.[1];
  const client = clients.find((c) => c.id === id);
  return <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><ActiveCompany name={client?.name ?? firmName} afm={client?.afm} label={client ? "Εργάζεστε για τον πελάτη" : "Λογιστικό γραφείο — συνολική εικόνα"} /><Link href="/office/clients" className="text-sm font-medium text-primary underline underline-offset-4" data-testid="office-change-client">{client ? "Αλλαγή πελάτη" : "Επιλογή πελάτη"}</Link></div>;
}
