// Σύνολο ERP — application shell and offline expense queue
// Στρατηγική:
//  - Navigation: network-first, fallback στο /offline (αν υπάρχει)
//  - Framework JS/CSS: network-only to keep SSR and client code in sync
//  - Images/fonts: stale-while-revalidate
//  - POST/PUT/DELETE στο /api/expenses/*: queued σε IndexedDB (Background Sync tag='expenses-outbox')
const CACHE = "synolo-v2";
const PRECACHE = ["/", "/manifest.webmanifest", "/icon-192.svg", "/icon-512.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => { const c = await caches.open(CACHE); await c.addAll(PRECACHE).catch(() => {}); self.skipWaiting(); })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    self.clients.claim();
  })());
});

async function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("tc-offline", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("expenses", { keyPath: "id", autoIncrement: true });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function queueOffline(request) {
  const db = await idbOpen();
  const body = await request.clone().text();
  const rec = { url: request.url, method: request.method, headers: [...request.headers], body, at: Date.now() };
  await new Promise((res, rej) => { const t = db.transaction("expenses", "readwrite"); t.objectStore("expenses").add(rec); t.oncomplete = res; t.onerror = () => rej(t.error); });
  if ("sync" in self.registration) try { await self.registration.sync.register("expenses-outbox"); } catch {}
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === "GET" && (url.pathname.startsWith("/_next/static") || url.pathname.endsWith(".css") || url.pathname.endsWith(".js"))) {
    // Framework chunks and CSS must match the current server render, especially in dev.
    // Never mix an older client bundle from a service worker with a newer RSC payload.
    e.respondWith(fetch(req));
    return;
  }
  if (req.method === "GET" && url.pathname.match(/\.(svg|png|jpg|woff2?)$/)) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      const fresh = fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; }).catch(() => cached);
      return cached || fresh;
    })());
    return;
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/expenses")) {
    e.respondWith((async () => {
      try { return await fetch(req.clone()); }
      catch { await queueOffline(req); return new Response(JSON.stringify({ ok: true, queued: true }), { status: 202, headers: { "Content-Type": "application/json" } }); }
    })());
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith((async () => { try { return await fetch(req); } catch { return (await caches.match("/")) ?? new Response("Offline", { status: 503 }); } })());
    return;
  }
});

self.addEventListener("sync", (e) => {
  if (e.tag !== "expenses-outbox") return;
  e.waitUntil((async () => {
    const db = await idbOpen();
    const all = await new Promise((res, rej) => { const t = db.transaction("expenses", "readonly"); const req = t.objectStore("expenses").getAll(); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
    for (const rec of all) {
      try {
        const r = await fetch(rec.url, { method: rec.method, headers: rec.headers, body: rec.body });
        if (r.ok) await new Promise((res, rej) => { const t = db.transaction("expenses", "readwrite"); t.objectStore("expenses").delete(rec.id); t.oncomplete = res; t.onerror = () => rej(t.error); });
      } catch {}
    }
  })());
});
