// Local-only diagnostic log for the sync lifecycle. Persisted so it survives
// a full app close, exported from Settings when a user reports data missing
// after reopening — the next occurrence is diagnosed from this evidence
// instead of another manual trace.
//
// PRIVACY: never log record content. Only counts, opaque id lists (for
// logs/activities — timestamp-based strings, not content), redacted error
// messages, sync mode, and a 6-char spreadsheet-id suffix. See
// summarizeState() below, which is the only place record shape is read.
//
// Symptom ids are deliberately excluded from the default id lists: legacy
// string-form symptoms derive their id from stableId('symptom', label), an
// FNV-1a hash of the Thai label text (see googleSheets.js). Because the
// symptom vocabulary is a small, guessable dictionary of short Thai words,
// that hash is effectively reversible and would leak which symptoms a pet
// has. counts.symptoms already covers diagnosing record loss without it.
const KEY = 'petcare.sync-debug-log.v1'
const MAX_ENTRIES = 200
// Keeps a single origin's localStorage (typically ~5MB) from ever being put
// at risk by this log alone. Without a byte cap, a user with many records
// could grow entries (connect_merged in particular, which carries two full
// id lists) into multi-megabyte territory — and a later unrelated write
// (the sync outbox) could then throw on quota exhaustion, causing the exact
// "unsaved record lost on close" symptom this log exists to diagnose.
const MAX_BYTES = 200_000

// apiFetch() error messages embed the full spreadsheet or Drive file id in
// the request path (e.g. "... /v4/spreadsheets/1BxiMVs0.../values:batchUpdate").
// Redact that segment so a logged error message can never carry more of the
// id than the deliberate 6-char suffix already used elsewhere (connect_start).
export function redactSyncErrorMessage(message) {
  return String(message ?? '').replace(/\/(spreadsheets|files)\/[^/:?\s\]),]+/g, '/$1/…')
}

// Every caller relies on this never throwing — a localStorage failure here
// (quota, private browsing) must never surface as a sync error.
export function appendSyncLog(event, details = {}) {
  try {
    const raw = window.localStorage.getItem(KEY)
    let log
    try {
      log = JSON.parse(raw)
      if (!Array.isArray(log)) log = []
    } catch {
      log = []
    }
    log.push({ ts: new Date().toISOString(), event, ...details })
    let trimmed = log.length > MAX_ENTRIES ? log.slice(log.length - MAX_ENTRIES) : log
    // Drop the oldest entries until the serialized log fits the byte cap,
    // always keeping at least the newest entry.
    while (trimmed.length > 1 && JSON.stringify(trimmed).length > MAX_BYTES) {
      trimmed = trimmed.slice(1)
    }
    window.localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch {
    // Swallowed on purpose: diagnostic logging must never change behavior.
  }
}

export function getSyncLog() {
  try {
    const raw = window.localStorage.getItem(KEY)
    const log = JSON.parse(raw)
    return Array.isArray(log) ? log : []
  } catch {
    return []
  }
}

export function clearSyncLog() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Swallowed on purpose, matching appendSyncLog/getSyncLog.
  }
}

const COUNT_KEYS = ['logs', 'symptoms', 'activities', 'tracks', 'pets', 'reminders', 'treatmentHistory']

// Reads only counts and (for idKeys) opaque `.id` values — never diary text,
// symptom labels, pet names, or any other field. 'symptoms' is intentionally
// excluded from the default idKeys — see the module-level note above.
export function summarizeState(state, { idKeys = ['logs', 'activities'] } = {}) {
  const counts = {}
  for (const key of COUNT_KEYS) counts[key] = (state?.[key] || []).length
  const ids = {}
  for (const key of idKeys) ids[key] = (state?.[key] || []).map(item => item?.id).filter(Boolean)
  return { counts, ids }
}
