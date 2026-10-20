/* 🔴 Cờ Ca-rô — service worker (PWA offline shell)
 * Strategy:
 *  - Navigations (HTML): network-first, fall back to cache.
 *  - /_next/static/*: cache-first (content-hashed, immutable).
 *  - Other same-origin GETs: network-first, fall back to cache.
 *  - Cross-origin (Supabase API, gtag, etc.): never cached, always network.
 */
const CACHE = "caro-v1";
const CORE = ["/", "/pwa/icon-192.png", "/pwa/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never intercept cross-origin requests.
  if (url.origin !== self.location.origin) return;

  // Immutable build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // Everything else same-origin: network-first, cache fallback.
  event.respondWith(
    fetch(req)
      .then((res) => {
        // Only cache successful basic responses.
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
  );
});

/* ---- Web Push ---- */
self.addEventListener("push", (event) => {
  let data = { title: "🔴 Cờ Ca-rô", body: "", url: "/", tag: undefined };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch {
    /* keep defaults; body may be plain text */
    try {
      data.body = event.data.text();
    } catch {
      /* ignore */
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || "",
      icon: "/pwa/icon-192.png",
      badge: "/pwa/icon-192.png",
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus an existing tab on our origin if one is open.
        for (const c of clients) {
          if (c.url.startsWith(self.location.origin)) {
            c.navigate(url);
            return c.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
self.addEventListener("push", (event) => {
  let data = { title: "🔴 Cờ Ca-rô", body: "", url: "/", tag: undefined };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch {
    /* keep defaults; body may be plain text */
    try {
      data.body = event.data.text();
    } catch {
      /* ignore */
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || "",
      icon: "/pwa/icon-192.png",
      badge: "/pwa/icon-192.png",
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus an existing tab on our origin if one is open.
        for (const c of clients) {
          if (c.url.startsWith(self.location.origin)) {
            c.navigate(url);
            return c.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
