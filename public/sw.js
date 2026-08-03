/* global self, caches, fetch, Response */

// This constant MUST match APP_VERSION in src/appVersion.js — appVersion.test.js
// enforces it. It is what makes this file's bytes change on every release: a
// browser only installs a new service worker when sw.js itself differs, so the
// previous fixed cache name left installed apps serving an old build forever.
const VERSION = '2026.08.03.1'
const CACHE = `petcare-shell-${VERSION}`

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/manifest.webmanifest'])))
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
    caches.open(CACHE).then(cache => cache.put(event.request, copy))
    return response
  }).catch(() => new Response('', { status: 504, statusText: 'Offline' }))))
})
