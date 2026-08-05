export function loadStoredState(storage, key, fallback) {
  try {
    const raw = storage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

// Never throws, mirroring loadStoredState: storage is best-effort. A failing
// setItem (QuotaExceededError is the realistic case — this app stores
// compressed photos, and the quota is shared across every petcare.* key) used
// to propagate out of the calling useEffect. With no error boundary above it,
// React 18 unmounted the whole app, which a user reported as "closed the app,
// data was gone". Returns whether the write landed, so callers that care can
// react; every current caller ignores it, exactly as before.
export function saveStoredState(storage, key, state) {
  try {
    storage.setItem(key, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}
