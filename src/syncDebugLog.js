// Local-only diagnostic log for the sync lifecycle. Persisted so it survives
// a full app close, exported from Settings when a user reports data missing
// after reopening — the next occurrence is diagnosed from this evidence
// instead of another manual trace.
//
// PRIVACY: never log record content. Only counts, opaque id lists (for
// logs/symptoms/activities — timestamp-based strings, not content), error
// messages, sync mode, and a 6-char spreadsheet-id suffix. See
// summarizeState() below, which is the only place record shape is read.
const KEY = 'petcare.sync-debug-log.v1'
const MAX_ENTRIES = 200

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
    const trimmed = log.length > MAX_ENTRIES ? log.slice(log.length - MAX_ENTRIES) : log
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
// symptom labels, pet names, or any other field.
export function summarizeState(state, { idKeys = ['logs', 'symptoms', 'activities'] } = {}) {
  const counts = {}
  for (const key of COUNT_KEYS) counts[key] = (state?.[key] || []).length
  const ids = {}
  for (const key of idKeys) ids[key] = (state?.[key] || []).map(item => item?.id).filter(Boolean)
  return { counts, ids }
}
