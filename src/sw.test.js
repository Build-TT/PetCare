import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

// public/sw.js is a plain, unbundled script (Vite copies public/ as-is), so it
// cannot be imported. Load it into a sandboxed context with fake
// self/caches/fetch and drive its real listeners, the same way
// gasSecurity.test.js drives gas/Code.gs.
const SW_SOURCE = path.resolve('public', 'sw.js')

// The documented cap in public/sw.js. Kept literal here so the eviction tests
// fail loudly if the service worker stops bounding its asset cache.
const EXPECTED_MAX_ASSET_CACHE_ENTRIES = 40

// The service worker script's own URL. Per the Cache API spec a string request
// is resolved into a Request against this base, so '/' is stored (and comes
// back out of cache.keys()) as an absolute URL — code that compares a key
// against the literal '/' would never match in a real browser.
const ORIGIN = 'https://petcare.example'
const SW_LOCATION = `${ORIGIN}/sw.js`
const abs = value => new URL(typeof value === 'string' ? value : value.url, SW_LOCATION).href
const keyOf = request => abs(request)

// Fake Cache. Per the Cache API spec's "Batch Cache Operations", a put first
// removes any entry matching the request and then appends the new one, so the
// entry list is in insertion order and re-putting the same key never
// duplicates it. cache.keys() therefore yields oldest-first Request objects,
// which is what the eviction logic relies on.
function makeCache({ writeError } = {}) {
  const entries = []
  const indexOf = request => entries.findIndex(entry => entry.key.url === keyOf(request))
  const cache = {
    entries,
    peak: 0,
    urls: () => entries.map(entry => entry.key.url),
    keys: () => Promise.resolve(entries.map(entry => entry.key)),
    put: (key, value) => {
      if (writeError) return Promise.reject(writeError)
      const existing = indexOf(key)
      if (existing !== -1) entries.splice(existing, 1)
      entries.push({ key: { url: keyOf(key), method: 'GET' }, value })
      cache.peak = Math.max(cache.peak, entries.length)
      return Promise.resolve()
    },
    match: key => {
      const found = entries[indexOf(key)]
      return Promise.resolve(found ? found.value : undefined)
    },
    delete: key => {
      const found = indexOf(key)
      if (found === -1) return Promise.resolve(false)
      entries.splice(found, 1)
      return Promise.resolve(true)
    },
    addAll: urls => Promise.all(urls.map(url => cache.put(url, { url, body: url }))),
  }
  return cache
}

function makeCaches(names = [], options = {}) {
  const store = new Map(names.map(name => [name, makeCache(options)]))
  return {
    store,
    open: name => {
      if (!store.has(name)) store.set(name, makeCache(options))
      return Promise.resolve(store.get(name))
    },
    keys: () => Promise.resolve([...store.keys()]),
    delete: name => Promise.resolve(store.delete(name)),
    match: request => {
      for (const cache of store.values()) {
        const found = cache.entries.find(entry => entry.key.url === keyOf(request))
        if (found) return Promise.resolve(found.value)
      }
      return Promise.resolve(undefined)
    },
  }
}

const makeResponse = url => ({ url, body: `body:${url}`, clone: () => ({ url, body: `body:${url}` }) })

function loadServiceWorker({ cacheNames = [], fetchImpl, writeError } = {}) {
  const listeners = {}
  const claims = []
  const fetches = []
  const cachesFake = makeCaches(cacheNames, { writeError })
  const sandbox = {
    console,
    self: {
      addEventListener: (type, handler) => { listeners[type] = handler },
      skipWaiting: () => {},
      location: { href: SW_LOCATION, origin: ORIGIN },
      clients: { claim: () => { claims.push(true); return Promise.resolve() } },
    },
    URL,
    caches: cachesFake,
    fetch: request => {
      fetches.push(keyOf(request))
      return fetchImpl ? fetchImpl(request) : Promise.resolve(makeResponse(keyOf(request)))
    },
    Response: class {
      constructor(body, init = {}) {
        this.body = body
        this.status = init.status
        this.statusText = init.statusText
      }
    },
  }
  const context = vm.createContext(sandbox)
  vm.runInContext(readFileSync(SW_SOURCE, 'utf8'), context, { filename: 'public/sw.js' })
  // `const` declarations live in the realm's global lexical scope rather than
  // on the sandbox object, so read them by evaluating in the same context.
  const binding = name => vm.runInContext(`typeof ${name} === 'undefined' ? undefined : ${name}`, context)
  return { listeners, caches: cachesFake, claims, fetches, binding }
}

// Cache writes in sw.js are deliberately detached from event.respondWith
// (`caches.open(...).then(...)` is not awaited), so yield to the macrotask
// queue to let every pending microtask chain settle.
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

async function dispatchFetch(listeners, request) {
  let responded
  listeners.fetch({ request, respondWith: promise => { responded = promise } })
  const response = responded ? await responded : undefined
  await settle()
  return response
}

const assetRequest = url => ({ url, method: 'GET', mode: 'cors' })
const assetUrls = count => Array.from({ length: count }, (_, index) => `/assets/index-${String(index).padStart(4, '0')}.js`)

async function dispatchInstall(listeners) {
  let installed
  listeners.install({ waitUntil: promise => { installed = promise } })
  await installed
  await settle()
}

describe('service worker asset cache', () => {
  it('bounds the asset cache and evicts the oldest entries across versionless deploys', async () => {
    const { listeners, caches, binding } = loadServiceWorker()
    const total = EXPECTED_MAX_ASSET_CACHE_ENTRIES + 5
    const urls = assetUrls(total)

    for (const url of urls) await dispatchFetch(listeners, assetRequest(url))

    const cache = caches.store.get(binding('CACHE'))
    expect(cache.entries.length).toBeLessThanOrEqual(EXPECTED_MAX_ASSET_CACHE_ENTRIES)
    // Trimming happens before the put, so the cap is never exceeded on the
    // serial path.
    expect(cache.peak).toBeLessThanOrEqual(EXPECTED_MAX_ASSET_CACHE_ENTRIES)
    // Exactly the newest entries survive, in order; the oldest deploys'
    // bundles are gone.
    expect(cache.urls()).toEqual(urls.slice(-EXPECTED_MAX_ASSET_CACHE_ENTRIES).map(abs))
    expect(cache.urls()).not.toContain(abs(urls[0]))
  })

  it('never evicts the offline shell, only real build assets', async () => {
    const { listeners, caches, binding } = loadServiceWorker()
    await dispatchInstall(listeners)
    await dispatchFetch(listeners, { url: `${ORIGIN}/pets`, method: 'GET', mode: 'navigate' })
    const urls = assetUrls(EXPECTED_MAX_ASSET_CACHE_ENTRIES + 5)

    for (const url of urls) await dispatchFetch(listeners, assetRequest(url))

    const cache = caches.store.get(binding('CACHE'))
    // The shell is what the navigate branch falls back to when offline; losing
    // it means the PWA cannot open at all without a network.
    expect(cache.urls()).toContain(abs('/'))
    expect(cache.urls()).toContain(abs('/manifest.webmanifest'))
    await expect(caches.match('/')).resolves.toBeDefined()
    await expect(caches.match('/manifest.webmanifest')).resolves.toBeDefined()
    // Old assets are still evicted, and the shell does not consume the budget.
    expect(cache.urls()).not.toContain(abs(urls[0]))
    expect(cache.urls().filter(url => url.includes('/assets/'))).toEqual(urls.slice(-EXPECTED_MAX_ASSET_CACHE_ENTRIES).map(abs))
  })

  it('documents the cap as a named constant in sw.js', () => {
    const { binding } = loadServiceWorker()
    expect(binding('MAX_ASSET_CACHE_ENTRIES')).toBe(EXPECTED_MAX_ASSET_CACHE_ENTRIES)
  })

  it('never evicts while the cache stays below the cap', async () => {
    const { listeners, caches, binding } = loadServiceWorker()
    const urls = Array.from({ length: 6 }, (_, index) => `/assets/chunk-${index}.js`)

    for (const url of urls) await dispatchFetch(listeners, assetRequest(url))

    expect(caches.store.get(binding('CACHE')).urls()).toEqual(urls.map(abs))
  })

  it('serves a cached asset without refetching it', async () => {
    const { listeners, caches, binding, fetches } = loadServiceWorker()
    const request = assetRequest('/assets/index-abc123.js')

    await dispatchFetch(listeners, request)
    const second = await dispatchFetch(listeners, request)

    expect(fetches).toEqual([abs(request.url)])
    expect(second).toMatchObject({ url: abs(request.url) })
    expect(caches.store.get(binding('CACHE')).urls()).toEqual([abs(request.url)])
  })

  it('keeps the navigate branch network-first and writing a single shell entry', async () => {
    const { listeners, caches, binding, fetches } = loadServiceWorker()
    const navigation = { url: `${ORIGIN}/pets`, method: 'GET', mode: 'navigate' }

    for (let i = 0; i < 12; i += 1) await dispatchFetch(listeners, navigation)

    expect(fetches).toHaveLength(12)
    expect(caches.store.get(binding('CACHE')).urls()).toEqual([abs('/')])
  })

  it('still serves the asset when the cache write fails, without an unhandled rejection', async () => {
    // A cross-origin opaque response cannot be cached; cache.put rejects. The
    // write chain is detached from respondWith, so an uncaught rejection there
    // would surface as an unhandled rejection in the worker (and fail this run).
    const { listeners } = loadServiceWorker({ writeError: new Error('opaque response not cacheable') })

    const response = await dispatchFetch(listeners, assetRequest('https://cdn.line-scdn.net/avatar.png'))
    await settle()

    expect(response).toMatchObject({ url: 'https://cdn.line-scdn.net/avatar.png' })
  })

  it('leaves non-GET requests to the network entirely', async () => {
    const { listeners, caches, fetches } = loadServiceWorker()
    let responded = false
    listeners.fetch({ request: { url: '/api/save', method: 'POST', mode: 'cors' }, respondWith: () => { responded = true } })
    await settle()

    expect(responded).toBe(false)
    expect(fetches).toEqual([])
    expect(caches.store.size).toBe(0)
  })

  it('still deletes every stale cache on activate', async () => {
    const { listeners, caches, claims, binding } = loadServiceWorker({ cacheNames: ['petcare-shell-2020.01.01.1', 'petcare-shell-2026.01.01.1', 'unrelated-cache'] })
    const current = binding('CACHE')
    await caches.open(current)

    let kept
    listeners.activate({ waitUntil: promise => { kept = promise } })
    await kept
    await settle()

    expect([...caches.store.keys()]).toEqual([current])
    expect(claims).toEqual([true])
  })
})
