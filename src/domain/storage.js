export function loadStoredState(storage, key, fallback) {
  try {
    const raw = storage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function saveStoredState(storage, key, state) {
  storage.setItem(key, JSON.stringify(state))
}
