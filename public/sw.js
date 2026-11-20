// Service Worker para Fruver POS (PWA Kiosk & Offline Shell)
const CACHE_NAME = "fruver-pos-shell-v19";
const STATIC_ASSETS = [
  "/",
  "/favicon.svg",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.json"
];

// 1. Instalación: Resiliente contra caídas o intercepciones parciales
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn("[SW] Advertencia al pre-cachear:", asset, err);
          })
        )
      );
    })
  );
});

// 2. Activación: Purgar TODAS las cachés antiguas para no servir assets obsoletos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[SW] Purgando caché obsoleta:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Estrategia de Fetch (Network-First Universal para garantizar actualizaciones en tiempo real):
self.addEventListener("fetch", (event) => {
  const requestUrl = event.request.url;

  // REGLA CRÍTICA: Solo interceptar peticiones HTTP/HTTPS (ignorar chrome-extension://, data:, blob:)
  if (!requestUrl.startsWith("http://") && !requestUrl.startsWith("https://")) {
    return;
  }

  // Ignorar métodos no GET
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(requestUrl);

  // Ignorar peticiones API, WebSocket, Swagger docs y OpenAPI (siempre directas a red)
  if (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/docs") ||
    url.pathname.startsWith("/openapi.json") ||
    url.pathname.startsWith("/ws")
  ) {
    return;
  }

  // A. Para navegación HTML (document / SPA routing): Network-First
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match("/index.html").then((cached) => {
            return cached || new Response("Offline", { status: 503, statusText: "Service Unavailable" });
          });
        })
    );
    return;
  }

  // B. Para assets (/assets/*, CSS, JS, imágenes): Network-First con Fallback a Caché
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && (networkResponse.type === "basic" || networkResponse.type === "cors")) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || new Response("Asset no disponible sin conexión", { status: 404, statusText: "Not Found" });
        });
      })
  );
});
