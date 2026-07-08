const CACHE_NAME = "coherence-offline-v1";

function shouldCache(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname === "/" ||
    url.pathname.startsWith("/data/") ||
    url.pathname.startsWith("/audio/") ||
    url.pathname.startsWith("/manuscripts/") ||
    url.pathname.startsWith("/_next/static/")
  );
}

async function cacheFirst(cache, request) {
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(cache, request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!shouldCache(request)) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/audio/")) {
        return cacheFirst(cache, request);
      }
      return networkFirst(cache, request);
    }),
  );
});
