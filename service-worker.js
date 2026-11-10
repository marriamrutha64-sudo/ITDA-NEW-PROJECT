const CACHE = "aarogya-shell-v6";
const SHELL = ["/", "/styles.css", "/app.js", "/medgemma-ui.js", "/manifest.json", "/icon.svg", "/offline-vault.js", "/gallery.js", "/reference-labels.js", "/call-diagnostics.js", "/care-records.js", "/offline-screening.js", "/offline-capture-ui.js", "/patient-call.html", "/patient-call.js", "/assets/reference/gums-reference.jpg", "/assets/reference/ulcer-reference-poster.jpg", "/assets/reference/tongue-reference.jpg", "/assets/reference/examination-reference.jpg", "/assets/reference/clinic-reference.jpg", "/assets/reference/outreach-reference.jpg", "/assets/reference/palate-reference.jpg"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/api/images/")) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && SHELL.includes(url.pathname)) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || Response.error())));
});
