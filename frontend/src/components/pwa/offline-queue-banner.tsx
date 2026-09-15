"use client";

import { useEffect, useState } from "react";
import { CloudOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface QueuedRecord { id: number; url: string; method: string; at: number; headers?: Record<string, string>; body?: string }

export function OfflineQueueBanner() {
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("indexedDB" in window)) return;
    let cancelled = false;
    const check = async () => {
      try {
        const db = await openDb();
        const c = await countRecords(db);
        if (!cancelled) setCount(c);
      } catch { /* db not yet initialized */ }
    };
    check();
    const t = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  async function sync() {
    if (typeof window === "undefined" || !navigator.onLine) return;
    setSyncing(true);
    try {
      const db = await openDb();
      const all = await getAll(db);
      let ok = 0, fail = 0;
      for (const rec of all) {
        try {
          const r = await fetch(rec.url, { method: rec.method, headers: rec.headers, body: rec.body });
          if (r.ok) { await deleteRec(db, rec.id); ok++; } else fail++;
        } catch { fail++; }
      }
      setCount(fail);
      if (ok > 0) toast.success(`Συγχρονίστηκαν ${ok} έξοδα.`);
      if (fail > 0) toast.error(`${fail} έξοδα απέτυχαν.`);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (online && count > 0 && !syncing) sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  if (count === 0 && online) return null;

  return (
    <div className={`fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-lg border p-3 shadow-lg backdrop-blur ${online ? "bg-amber-50/95 border-amber-300" : "bg-red-50/95 border-red-300"}`}>
      <div className="flex items-center gap-3">
        <CloudOff className={`size-5 ${online ? "text-amber-600" : "text-red-600"}`} />
        <div className="flex-1 text-sm">
          {online ? (
            <>Έχεις <strong>{count}</strong> έξοδα σε ουρά — συγχρονίζονται…</>
          ) : (
            <>Είσαι offline. {count > 0 ? <>Έχεις <strong>{count}</strong> έξοδα που θα σταλούν όταν επανέλθει η σύνδεση.</> : <>Οι νέες καταχωρήσεις θα αποθηκευτούν τοπικά.</>}</>
          )}
        </div>
        {online && count > 0 ? (
          <button type="button" onClick={sync} disabled={syncing} className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-60">
            <RotateCcw className={`size-3 ${syncing ? "animate-spin" : ""}`} /> Συγχρονισμός
          </button>
        ) : null}
      </div>
    </div>
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open("tc-offline", 1);
    req.onupgradeneeded = () => { req.result.createObjectStore("expenses", { keyPath: "id", autoIncrement: true }); };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function countRecords(db: IDBDatabase): Promise<number> {
  return new Promise((res, rej) => {
    try {
      const t = db.transaction("expenses", "readonly");
      const c = t.objectStore("expenses").count();
      c.onsuccess = () => res(c.result);
      c.onerror = () => rej(c.error);
    } catch { res(0); }
  });
}
function getAll(db: IDBDatabase): Promise<QueuedRecord[]> {
  return new Promise((res, rej) => {
    const t = db.transaction("expenses", "readonly");
    const r = t.objectStore("expenses").getAll();
    r.onsuccess = () => res(r.result as QueuedRecord[]);
    r.onerror = () => rej(r.error);
  });
}
function deleteRec(db: IDBDatabase, id: number): Promise<void> {
  return new Promise((res, rej) => {
    const t = db.transaction("expenses", "readwrite");
    t.objectStore("expenses").delete(id);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
