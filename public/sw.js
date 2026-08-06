/* global self, caches, fetch, Response, URL */

// This constant MUST match APP_VERSION in src/appVersion.js — appVersion.test.js
// enforces it. It is what makes this file's bytes change on every release: a
// browser only installs a new service worker when sw.js itself differs, so the
// previous fixed cache name left installed apps serving an old build forever.
const VERSION = '2026.08.03.1'
const CACHE = `petcare-shell-${VERSION}`

// The offline shell. These share CACHE with the build assets, so eviction must
// never touch them: '/manifest.webmanifest' is written once at install and
// never re-put, which would make it the very first thing evicted, and losing
// '/' breaks the navigate handler's offline fallback — the PWA would fail to
// open with no network at all. Cache keys come back as absolute URLs, so
// resolve these against the worker's own URL for comparison.
const SHELL_ASSETS = ['/', '/manifest.webmanifest']
const SHELL_ASSET_URLS = SHELL_ASSETS.map(asset => new URL(asset, self.location.href).href)

// Every deploy's content-hashed bundle filenames differ, so this cache only
// ever grows unless the SW itself is reinstalled (VERSION bump) — which
// happens only when the backend-compat version changes, not on every web
// deploy. Bounding entry count here means storage stays capped regardless of
// how many versionless deploys happen between SW refreshes.
const MAX_ASSET_CACHE_ENTRIES = 40

// cache.keys() yields entries in insertion order (a put removes any matching
// entry before appending), so the head of the list is the oldest build's
// asset. Trim to one below the cap so adding the new entry lands exactly at
// it: never exceeded on the serial path, though concurrent misses can
// transiently overshoot by the in-flight count, self-correcting on the next
// put.
function evictOldestAssetCacheEntries(cache) {
  return cache.keys().then(keys => {
    const evictable = keys.filter(key => SHELL_ASSET_URLS.indexOf(key.url) === -1)
    const excess = evictable.length - (MAX_ASSET_CACHE_ENTRIES - 1)
    if (excess <= 0) return undefined
    return Promise.all(evictable.slice(0, excess).map(key => cache.delete(key)))
  })
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()),
))

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return

  // Network-first for the app shell so a deploy is picked up on next launch,
  // falling back to the cached shell only when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone()
      caches.open(CACHE).then(cache => cache.put('/', copy))
      return response
    }).catch(() => caches.match('/')))
    return
  }

  // Build assets carry a content hash, so cache-first is safe and a new build
  // always misses. A failed asset must NOT fall back to the cached HTML shell:
  // returning a document where a script or stylesheet is expected breaks the
  // page in ways that look nothing like the network error that caused it.
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone()
    // Detached from respondWith on purpose — a cache write must never delay or
    // fail the response, so swallow its rejections (an opaque cross-origin
    // response, for one, cannot be cached at all).
    caches.open(CACHE).then(cache => evictOldestAssetCacheEntries(cache).then(() => cache.put(event.request, copy))).catch(() => {})
    return response
  }).catch(() => new Response('', { status: 504, statusText: 'Offline' }))))
})
