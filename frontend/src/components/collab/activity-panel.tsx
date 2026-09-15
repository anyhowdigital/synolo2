"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Image as ImageIcon, Loader2, Mail, MessageSquare, Paperclip, Send, Trash2, UploadCloud, History, Globe, UserRound } from "lucide-react";
import { toast } from "sonner";
import { addNoteAction, deleteAttachmentAction, deleteNoteAction, uploadAttachmentAction } from "@/app/actions/collab";
import type { ActivityItem, AttachmentMeta, CollabEntity } from "@/lib/services/collab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ActivityPanel({
  entityType,
  entityId,
  activity,
  attachments,
  canWrite,
  currentUserId,
  isAdmin,
  className,
}: {
  entityType: CollabEntity;
  entityId: string;
  activity: ActivityItem[];
  attachments: AttachmentMeta[];
  canWrite: boolean;
  currentUserId: string;
  isAdmin: boolean;
  className?: string;
}) {
  const [note, setNote] = useState("");
  const [toCustomer, setToCustomer] = useState(false);
  const [pending, start] = useTransition();
  const customerMessages = activity.filter((a) => a.kind === "note" && a.authorType === "customer").length;
  const fileRef = useRef<HTMLInputElement>(null);
  const notesCount = activity.filter((a) => a.kind === "note").length;

  const submitNote = () => {
    if (!note.trim()) return;
    start(async () => {
      const res = await addNoteAction(entityType, entityId, note, toCustomer ? "customer" : "internal");
      if (res.ok) {
        setNote("");
        toast.success(toCustomer ? "Η απάντηση δημοσιεύτηκε στη σελίδα του πελάτη." : "Η σημείωση αποθηκεύτηκε.");
      } else toast.error(res.error);
    });
  };

  const removeNote = (id: string) =>
    start(async () => {
      const res = await deleteNoteAction(id);
      if (!res.ok) toast.error(res.error);
    });

  const upload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const res = await uploadAttachmentAction(entityType, entityId, fd);
      if (res.ok) toast.success(`Το αρχείο «${file.name}» προστέθηκε.`);
      else toast.error(res.error);
      if (fileRef.current) fileRef.current.value = "";
    });
  };

  const removeAttachment = (a: AttachmentMeta) => {
    if (!confirm(`Διαγραφή του συνημμένου «${a.fileName}»;`)) return;
    start(async () => {
      const res = await deleteAttachmentAction(a.id);
      if (res.ok) toast.success("Το συνημμένο διαγράφηκε.");
      else toast.error(res.error);
    });
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" /> Ιστορικό & συνεργασία
        </CardTitle>
        <CardDescription>Ενέργειες, emails, εσωτερικές σημειώσεις ομάδας και συνημμένα. Μόνο οι σημειώσεις που επισημαίνετε «ορατές στον πελάτη» εμφανίζονται στη δημόσια σελίδα του.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="timeline">
          <TabsList className="w-full">
            <TabsTrigger value="timeline" className="flex-1">
              Ιστορικό {activity.length ? <span className="ml-1 text-muted-foreground">({activity.length})</span> : null}
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1">
              Σημειώσεις {notesCount ? <span className="ml-1 text-muted-foreground">({notesCount})</span> : null}
              {customerMessages ? <span className="ml-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-white" title="Μηνύματα πελάτη">{customerMessages}</span> : null}
            </TabsTrigger>
            <TabsTrigger value="files" className="flex-1">
              Συνημμένα {attachments.length ? <span className="ml-1 text-muted-foreground">({attachments.length})</span> : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="pt-3">
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Δεν υπάρχει ακόμη ιστορικό.</p>
            ) : (
              <ol className="relative ml-2 space-y-3 border-l pl-4 text-sm">
                {activity.slice(0, 60).map((item) => (
                  <li key={item.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[21px] top-1 flex size-3 items-center justify-center rounded-full ring-2 ring-background",
                        item.kind === "note" ? "bg-amber-500" : item.kind === "email" ? "bg-sky-500" : "bg-muted-foreground/60",
                      )}
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="font-medium">{item.title}</span>
                      <time className="text-xs text-muted-foreground tabular-nums">{when(item.at)}</time>
                    </div>
                    {item.detail ? <p className="whitespace-pre-wrap break-words text-muted-foreground">{item.detail}</p> : null}
                    {item.actor ? <p className="text-xs text-muted-foreground">από {item.actor}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>

          <TabsContent value="notes" className="space-y-3 pt-3">
            <div className="grid gap-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={toCustomer ? "Απάντηση προς τον πελάτη – θα εμφανιστεί στη δημόσια σελίδα του παραστατικού." : "Εσωτερική σημείωση για την ομάδα, π.χ. «Ο πελάτης ζήτησε παράταση πληρωμής έως 30/6»."}
                rows={3}
                maxLength={4000}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitNote();
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                {entityType === "invoice" ? (
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={toCustomer} onCheckedChange={(v) => setToCustomer(v === true)} /> <Globe className="size-3.5 text-muted-foreground" /> Ορατό στον πελάτη (απάντηση στη συζήτηση)
                  </label>
                ) : (
                  <span className="text-xs text-muted-foreground">Ctrl/⌘+Enter για αποθήκευση</span>
                )}
                <Button size="sm" onClick={submitNote} disabled={pending || !note.trim()}>
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                  Προσθήκη σημείωσης
                </Button>
              </div>
            </div>
            {notesCount === 0 ? (
              <p className="text-sm text-muted-foreground">Καμία σημείωση ακόμη.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {activity
                  .filter((a) => a.kind === "note")
                  .map((n) => (
                    <li
                      key={n.id}
                      className={cn(
                        "rounded-lg border p-3",
                        n.authorType === "customer" ? "border-primary/30 bg-primary/5" : n.visibility === "customer" ? "bg-sky-50/60 dark:bg-sky-950/20" : "bg-amber-50/60 dark:bg-amber-950/20",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {n.authorType === "customer" ? <UserRound className="size-3.5" /> : <MessageSquare className="size-3.5" />} {n.actor} · {when(n.at)}
                          {n.authorType === "customer" ? (
                            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Πελάτης</Badge>
                          ) : n.visibility === "customer" ? (
                            <Badge variant="outline" className="h-4 gap-1 px-1.5 text-[10px]"><Globe className="size-2.5" /> Ορατό στον πελάτη</Badge>
                          ) : null}
                        </div>
                        {n.noteId && (isAdmin || n.authorId === currentUserId) ? (
                          <Button variant="ghost" size="icon-sm" aria-label="Διαγραφή σημείωσης" disabled={pending} onClick={() => removeNote(n.noteId!)}>
                            <Trash2 />
                          </Button>
                        ) : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words">{n.detail}</p>
                    </li>
                  ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="files" className="space-y-3 pt-3">
            {canWrite ? (
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center text-sm"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  upload(e.dataTransfer.files);
                }}
              >
                <UploadCloud className="size-6 text-muted-foreground" />
                <p className="text-muted-foreground">Σύρετε ένα αρχείο εδώ ή</p>
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.xls,.xlsx,.doc,.docx,.xml" onChange={(e) => upload(e.target.files)} />
                <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Paperclip data-icon="inline-start" />}
                  Επιλογή αρχείου
                </Button>
                <p className="text-xs text-muted-foreground">PDF, εικόνες, Excel/CSV, Word, XML · έως 4 MB</p>
              </div>
            ) : null}
            {attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Κανένα συνημμένο.</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 p-2.5">
                    {a.mimeType.startsWith("image/") ? <ImageIcon className="size-4 shrink-0 text-muted-foreground" /> : a.mimeType.includes("mail") ? <Mail className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">
                        {a.fileName}
                      </a>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(a.size)} · {when(a.createdAt)}
                        {a.uploadedByName ? ` · ${a.uploadedByName}` : ""}
                      </div>
                    </div>
                    {canWrite ? (
                      <Button variant="ghost" size="icon-sm" aria-label="Διαγραφή συνημμένου" disabled={pending} onClick={() => removeAttachment(a)}>
                        <Trash2 />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
