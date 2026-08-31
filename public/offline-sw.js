const RUNTIME_CACHE_NAME = "coherence-offline-runtime-v2";
const METADATA_CACHE_NAME = "coherence-offline-metadata-v2";
const PACK_RECORD_PREFIX = "https://coherence.invalid/__offline-pack__/";
const PACK_INSTALL_BYPASS_PARAMETER = "__coherence_offline_install";
const PUBLISHER_PACK_SCHEMA_VERSION = 3;
const SHA256_IDENTITY = /^sha256:[0-9a-f]{64}$/;
const V2_PACK_RECORD_KEYS = [
  "cacheName",
  "href",
  "packageVersion",
  "savedAt",
  "urls",
  "volumeId",
];
const V3_PACK_RECORD_KEYS = [
  ...V2_PACK_RECORD_KEYS,
  "publisherRuntimeAuthority",
  "schemaVersion",
];

function shouldHandle(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.searchParams.has(PACK_INSTALL_BYPASS_PARAMETER)) return false;
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

function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function hasPackRecordFields(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.volumeId === "string" &&
    typeof value.href === "string" &&
    typeof value.packageVersion === "string" &&
    typeof value.cacheName === "string" &&
    typeof value.savedAt === "string" &&
    Array.isArray(value.urls) &&
    value.urls.every((url) => typeof url === "string"),
  );
}

function isPublisherRuntimeAuthority(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    hasExactKeys(value, ["buildId", "kind", "schemaVersion"]) &&
    value.kind === "publisher-embedded" &&
    value.schemaVersion === PUBLISHER_PACK_SCHEMA_VERSION &&
    typeof value.buildId === "string" &&
    SHA256_IDENTITY.test(value.buildId),
  );
}

function isPackRecord(value) {
  if (!hasPackRecordFields(value)) return false;
  if (hasExactKeys(value, V2_PACK_RECORD_KEYS)) return true;
  return (
    hasExactKeys(value, V3_PACK_RECORD_KEYS) &&
    value.schemaVersion === PUBLISHER_PACK_SCHEMA_VERSION &&
    isPublisherRuntimeAuthority(value.publisherRuntimeAuthority)
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
