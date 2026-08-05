// Read-only diagnostic: reports the size (in UTF-16 code units) of every
// localStorage key for this origin, plus a per-pet photo size breakdown
// when the local app state key is present. Exists to let a user with an
// unexpectedly large origin storage footprint (Chrome's Site Settings
// aggregates localStorage + Cache Storage, so it alone can't say which key
// is large) tell us which key — or which pet's photo — is the culprit.
//
// Must never throw and must never write to storage: this is purely a
// debugging aid, and a bug here must not become a new crash source for the
// exact problem it exists to diagnose. Deliberately standalone from
// src/domain/storage.js (loadStoredState/saveStoredState) since those are
// write-capable and this module only ever reads.

const LOCAL_STATE_KEY = 'petcare.local.v1'

export function getStorageUsageReport(storage = window.localStorage) {
  try {
    const entries = []
    let totalChars = 0
    const length = storage.length
    for (let i = 0; i < length; i++) {
      const key = storage.key(i)
      if (key == null) continue
      const value = storage.getItem(key)
      const chars = typeof value === 'string' ? value.length : 0
      entries.push({ key, chars })
      totalChars += chars
    }
    entries.sort((a, b) => b.chars - a.chars)

    let petPhotoSizes = []
    try {
      const rawLocalState = storage.getItem(LOCAL_STATE_KEY)
      if (rawLocalState) {
        const parsed = JSON.parse(rawLocalState)
        if (parsed && Array.isArray(parsed.pets)) {
          petPhotoSizes = parsed.pets
            .filter(pet => pet && typeof pet.photo === 'string' && pet.photo.length > 0)
            .map(pet => ({
              name: pet.name || pet.id,
              id: pet.id,
              photoChars: pet.photo.length,
            }))
            .sort((a, b) => b.photoChars - a.photoChars)
        }
      }
    } catch {
      petPhotoSizes = []
    }

    return { totalChars, entries, petPhotoSizes }
  } catch {
    return { totalChars: 0, entries: [], petPhotoSizes: [] }
  }
}
