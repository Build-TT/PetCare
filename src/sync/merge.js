// Three-way merge for PetCare state.
//
// Every device keeps a *baseline*: the id -> timestamp map of the remote state
// it last successfully synchronised with. The baseline is the common ancestor
// that lets us tell "the other device created this record" apart from "I
// deleted this record", which a plain last-writer-wins overwrite cannot do —
// that ambiguity is what used to erase a shared Sheet on every save.
//
// Conflict policy: when both sides changed the same record the newer
// updated_at wins; when one side deleted a record the other side edited, the
// edit wins. Data is never dropped on an ambiguous conflict.

export const SYNCED_COLLECTIONS = [
  'pets', 'tracks', 'logs', 'activities', 'reminders', 'symptoms', 'treatmentHistory', 'lineRecipients',
]

export function recordId(record) {
  if (record === null || record === undefined) return ''
  if (typeof record !== 'object') return ''
  return String(record.id ?? '')
}

// The raw string, used for baseline identity where only "is this byte-for-byte
// the value I last synced" matters.
export function recordTimestamp(record) {
  if (!record || typeof record !== 'object') return ''
  return String(record.updated_at || record.created_at || '')
}

// Ordering must not be a string compare: the app writes both local-time
// ('2026-08-01T10:05') and full ISO ('…T10:05:00.000Z') stamps, and comparing
// those as text ranks the same instant differently depending on how it was
// spelled. Records with no timestamp sort oldest, except that a record which
// has never been stamped locally must not lose to the copy the serializer
// stamped on its way into the Sheet — see recordIsNewer.
export function recordTime(record) {
  const value = recordTimestamp(record)
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

export function recordIsNewer(candidate, current) {
  const candidateTime = recordTime(candidate)
  const currentTime = recordTime(current)
  // An untimestamped record is a local edit the serializer has not seen yet;
  // the timestamped side is that same record's saved copy, so it must not win.
  if (currentTime === null) return false
  if (candidateTime === null) return false
  return candidateTime > currentTime
}

export function snapshotBaseline(state) {
  return Object.fromEntries(SYNCED_COLLECTIONS.map(name => {
    const records = Array.isArray(state?.[name]) ? state[name] : []
    return [name, Object.fromEntries(records.map(record => [recordId(record), recordTimestamp(record)]).filter(([id]) => id))]
  }))
}

export function mergeCollection(baselineTimestamps, localRecords = [], remoteRecords = []) {
  const local = Array.isArray(localRecords) ? localRecords : []
  const remote = Array.isArray(remoteRecords) ? remoteRecords : []
  // A null baseline means this device has never synchronised: keep everything.
  const baseline = baselineTimestamps && typeof baselineTimestamps === 'object' ? baselineTimestamps : null
  const knownInBaseline = id => Boolean(baseline) && Object.prototype.hasOwnProperty.call(baseline, id)
  const unchangedSinceBaseline = record => knownInBaseline(recordId(record)) && baseline[recordId(record)] === recordTimestamp(record)

  const remoteById = new Map(remote.map(record => [recordId(record), record]).filter(([id]) => id))
  const merged = []
  const consumed = new Set()

  for (const record of local) {
    const id = recordId(record)
    // Records without a usable id cannot be matched, so they are always kept.
    if (!id) { merged.push(record); continue }
    if (remoteById.has(id)) {
      const counterpart = remoteById.get(id)
      consumed.add(id)
      merged.push(recordIsNewer(counterpart, record) ? counterpart : record)
      continue
    }
    // Missing remotely: a delete from the other device, unless this device has
    // edited the record since the baseline (edit beats delete).
    if (unchangedSinceBaseline(record)) continue
    merged.push(record)
  }

  const localIds = new Set(local.map(recordId).filter(Boolean))
  for (const record of remote) {
    const id = recordId(record)
    if (!id) { merged.push(record); continue }
    if (consumed.has(id) || localIds.has(id)) continue
    // Missing locally: this device deleted it, unless the other device has
    // edited it since the baseline (edit beats delete).
    if (unchangedSinceBaseline(record)) continue
    merged.push(record)
  }
  return merged
}

export function mergePersistedStates({ baseline = null, local = {}, remote = null }) {
  const localState = local && typeof local === 'object' ? local : {}
  if (!remote || typeof remote !== 'object') return { ...localState }
  const merged = { ...remote, ...localState }
  for (const name of SYNCED_COLLECTIONS) {
    merged[name] = mergeCollection(baseline?.[name] ?? null, localState[name], remote[name])
  }
  // Keep this device's selection only while it still names a pet that survived
  // the merge; a stale or demo-only id would otherwise hide every record that
  // belongs to the real pet coming from the Sheet.
  const mergedPetIds = new Set((merged.pets || []).map(recordId).filter(Boolean))
  merged.activePetId = [localState.activePetId, remote.activePetId].find(id => id && mergedPetIds.has(String(id)))
    || (mergedPetIds.size ? String((merged.pets || []).map(recordId).find(Boolean)) : (localState.activePetId || remote.activePetId || ''))
  return merged
}
