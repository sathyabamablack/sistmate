/*
 * Unified Student Portal — service worker.
 *
 * Privacy first: this app shows personal data (marks, attendance, fees) and
 * may be used on shared devices. The worker therefore NEVER stores:
 *   - HTML page navigations (every authenticated page),
 *   - React Server Component payloads (client-side navigations),
 *   - anything under /api/,
 *   - any response marked `Cache-Control: private` or `no-store`.
 *
 * It only stores the static offline page, the app icons and content-hashed,
 * immutable build assets (/_next/static/**, fonts). Navigations are
 * network-first and fall back to the offline page when the network is down,
 * so a signed-out user can never be shown a stale authenticated page.
 *
 * Updates: the build step (scripts/inject-sw-version.mjs) writes
 * /sw-version.js, which sets self.__USP_BUILD__ to this deploy's id. The id is
 * part of every cache name, and a changed imported script makes the browser
 * install the new worker, so each deploy refreshes the offline page and its
 * assets once and the previous deploy's caches are deleted on activate. In dev
 * the file does not exist and the id falls back to "dev".
 */

let BUILD = "dev";
/** Origin of the static-file host when the build uses one (next.config ASSET_PREFIX), else "". */
let ASSET_ORIGIN = "";
try {
  importScripts("/sw-version.js");
  if (typeof self.__USP_BUILD__ === "string" && self.__USP_BUILD__) BUILD = self.__USP_BUILD__;
  if (typeof self.__USP_ASSETS__ === "string") ASSET_ORIGIN = self.__USP_ASSETS__;
} catch {
  /* no build id available (dev server): use the fallback */
}

// v2: separate cache for the offline page's assets (never trimmed) and build-id cache names.
const VERSION = `v2-${BUILD}`;
const CACHE_PREFIX = "usp-";
const PRECACHE = `${CACHE_PREFIX}precache-${VERSION}`;
/** Assets the offline page needs to render. Never trimmed, so it always works offline. */
const OFFLINE_ASSETS = `${CACHE_PREFIX}offline-assets-${VERSION}`;
/** Runtime cache of hashed build assets seen while browsing. Trimmed to a maximum size. */
const STATIC_CACHE = `${CACHE_PREFIX}static-${VERSION}`;
const STATIC_CACHE_MAX_ENTRIES = 150;

const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

/** True when a response says it must not be stored by a shared cache. */
function isPrivate(response) {
  const cc = (response.headers.get("Cache-Control") || "").toLowerCase();
  return cc.includes("no-store") || cc.includes("private");
}

/**
 * Only successful, publicly cacheable responses from this site ("basic") or the asset host
 * ("cors": it sends Access-Control-Allow-Origin) are stored. Opaque responses never are.
 */
function isStorable(response) {
  return (
    response &&
    response.ok &&
    response.status === 200 &&
    (response.type === "basic" || response.type === "cors") &&
    !isPrivate(response)
  );
}

function isImmutableStatic(url, request) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/icons/")) return true;
  if (request.destination === "font") return true;
  return /\.(?:woff2?|ttf|otf)$/i.test(url.pathname);
}

/**
 * Evicts the oldest entries beyond `maxEntries`. Only ever called for the
 * runtime STATIC_CACHE: the offline page and the assets it needs live in the
 * PRECACHE and OFFLINE_ASSETS caches, which are never trimmed.
 */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

/*
 * Precache the offline page plus the build assets it references, so it
 * renders fully styled (and its "Try again" button hydrates) with no network.
 * The offline page itself is static and contains no personal data.
 */
async function precache() {
  const cache = await caches.open(PRECACHE);

  const offlineResponse = await fetch(OFFLINE_URL, { cache: "reload", credentials: "omit" });
  if (!offlineResponse.ok) throw new Error(`Offline page fetch failed: ${offlineResponse.status}`);
  const html = await offlineResponse.clone().text();
  await cache.put(OFFLINE_URL, offlineResponse);

  await cache.addAll(
    PRECACHE_URLS.filter((u) => u !== OFFLINE_URL).map((u) => new Request(u, { cache: "reload" })),
  );

  // Best effort: the hashed CSS/JS/font files the offline page needs, from wherever the page
  // loads them (this site, or the asset host as an absolute URL).
  const assets = new Set();
  for (const match of html.matchAll(/(?:https:\/\/[^"'\s/<>\\]+)?\/_next\/static\/[^"'\s)<>\\]+/g)) {
    const url = match[0].replace(/&amp;/g, "&");
    if (url.startsWith("/") || (ASSET_ORIGIN && url.startsWith(`${ASSET_ORIGIN}/`))) assets.add(url);
  }
  const offlineAssets = await caches.open(OFFLINE_ASSETS);
  await Promise.all(
    [...assets].map(async (path) => {
      try {
        const res = await fetch(path, { credentials: "omit", mode: "cors" });
        if (isStorable(res)) await offlineAssets.put(path, res);
      } catch {
        /* ignore — fetched again at runtime */
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PRECACHE, OFFLINE_ASSETS, STATIC_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && !keep.has(name))
          .map((name) => caches.delete(name)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

/** Network-first for page loads; never stored. Offline page on failure. */
async function handleNavigation(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const cached = await caches.match(OFFLINE_URL, { cacheName: PRECACHE });
    return (
      cached ||
      new Response("You are offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      })
    );
  }
}

/** Cache-first for content-hashed, immutable assets. */
async function handleStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isStorable(response)) {
    const copy = response.clone();
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.put(request, copy))
      .then(() => trimCache(STATIC_CACHE, STATIC_CACHE_MAX_ENTRIES))
      .catch(() => {});
  }
  return response;
}

/** A file from the asset host; if that host fails, the same file from this site (it is there too). */
async function handleAssetHost(request, url) {
  try {
    const response = await handleStatic(request);
    if (response.ok) return response;
  } catch {
    /* asset host unreachable: fall through */
  }
  return fetch(url.pathname + url.search, { credentials: "same-origin" });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.headers.has("range")) return;

  const url = new URL(request.url);
  // The asset host only serves content-hashed build files: cache-first, like our own.
  if (ASSET_ORIGIN && url.origin === ASSET_ORIGIN) {
    if (url.pathname.startsWith("/_next/static/")) event.respondWith(handleAssetHost(request, url));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Personal data: always straight to the network, never touched.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }

  // RSC payloads (client-side navigations) carry personal data — pass through.
  if (request.headers.has("rsc") || url.searchParams.has("_rsc")) return;

  if (isImmutableStatic(url, request)) {
    event.respondWith(handleStatic(request));
  }
  // Everything else falls through to the browser's normal network handling.
});
