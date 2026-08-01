const RUNTIME_CACHE_NAME = "coherence-offline-runtime-v2";
const METADATA_CACHE_NAME = "coherence-offline-metadata-v2";
const PACK_RECORD_PREFIX = "https://coherence.invalid/__offline-pack__/";

function shouldHandle(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname === "/" ||
    url.pathname === "/overview/" ||
    url.pathname.startsWith("/art/") ||
    url.pathname.startsWith("/data/") ||
    url.pathname.startsWith("/manuscripts/") ||
    url.pathname.startsWith("/_next/image/") ||
    url.pathname.startsWith("/_next/static/")
  );
}

function isPackRecord(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.cacheName === "string" &&
    typeof value.savedAt === "string" &&
    Array.isArray(value.urls)
  );
}

async function activePackRecords() {
  try {
    const metadata = await caches.open(METADATA_CACHE_NAME);
    const keys = await metadata.keys();
    const records = await Promise.all(
      keys
        .filter((request) => request.url.startsWith(PACK_RECORD_PREFIX))
        .map(async (request) => {
          try {
            const response = await metadata.match(request);
            const value = response ? await response.json() : null;
            return isPackRecord(value) ? value : null;
          } catch {
            return null;
          }
        }),
    );
    return records
      .filter(Boolean)
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  } catch {
    return [];
  }
}

async function matchActivePackage(request) {
  for (const record of await activePackRecords()) {
    const response = await (await caches.open(record.cacheName)).match(request);
    if (response) return response;
  }
  return undefined;
}

async function portableCacheResponse(response) {
  if (!response.redirected) return response.clone();
  return new Response(await response.clone().arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function networkFirst(request) {
  const runtime = await caches.open(RUNTIME_CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok)
      await runtime.put(request, await portableCacheResponse(response));
    return response;
  } catch (error) {
    const packaged = await matchActivePackage(request);
    if (packaged) return packaged;
    const opportunistic = await runtime.match(request);
    if (opportunistic) return opportunistic;
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.delete("coherence-offline-runtime-v1"),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  if (!shouldHandle(event.request)) return;
  event.respondWith(networkFirst(event.request));
});
