import { loadPetCareState, savePetCareState } from './googleSheets.js'
import { loadAccountState, saveAccountState } from './accountAuth.js'
import { mergePersistedStates, snapshotBaseline } from './sync/merge.js'

export const SYNC_BASELINE_KEY = 'petcare.sync-baseline.v1'

export { snapshotBaseline }

export function isCurrentRemoteRevision(currentRevision, requestRevision) {
  return currentRevision === requestRevision
}

export function unwrapPendingState(outbox) {
  return outbox && outbox.state && Number.isInteger(outbox.revision) ? outbox.state : outbox
}

export function selectPersistedState(state) {
  return {
    tracks: state.tracks || [],
    logs: state.logs || [],
    activities: state.activities || [],
    reminders: state.reminders || [],
    symptoms: state.symptoms || [],
    pets: (state.pets || []).filter(pet => !pet.demo),
    treatmentHistory: state.treatmentHistory || [],
    lineRecipients: state.lineRecipients || [],
    activePetId: state.activePetId || '',
  }
}

// Hydration merges the three inputs rather than picking one whole side:
// remote data another device wrote, local data this device holds, and the
// not-yet-acknowledged outbox. `baseline` is the last remote snapshot this
// device synchronised with and is what makes deletes distinguishable from
// records created elsewhere — see src/sync/merge.js.
export function hydrateRemoteState(remoteState, fallback, pendingState = null, baseline = null) {
  if (!remoteState || typeof remoteState !== 'object') return pendingState ? { ...fallback, ...selectPersistedState(pendingState) } : fallback
  const persisted = selectPersistedState(fallback)
  const local = Object.fromEntries(Object.keys(persisted).map((key) => [
    key,
    Array.isArray(persisted[key])
      ? (Array.isArray(pendingState?.[key]) ? pendingState[key] : persisted[key])
      : (pendingState?.[key] ?? persisted[key]),
  ]))
  return mergePersistedStates({ baseline, local, remote: remoteState })
}

export async function loadRemoteState(accessToken, spreadsheetId, connection = null) {
  if (connection?.mode === 'account') return loadAccountState(connection.accountToken)
  return loadPetCareState(accessToken, spreadsheetId)
}

export async function saveRemoteState(accessToken, spreadsheetId, state, connection = null, baseline = null) {
  if (connection?.mode === 'account') return saveAccountState(connection.accountToken, selectPersistedState(state), baseline)
  return savePetCareState(accessToken, spreadsheetId, selectPersistedState(state), baseline)
}
