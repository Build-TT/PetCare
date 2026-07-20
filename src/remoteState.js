import { loadPetCareState, savePetCareState } from './googleSheets.js'

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
    pets: state.pets || [],
    treatmentHistory: state.treatmentHistory || [],
    lineRecipients: state.lineRecipients || [],
    activePetId: state.activePetId || '',
  }
}

export function hydrateRemoteState(remoteState, fallback, pendingState = null) {
  if (!remoteState || typeof remoteState !== 'object') return pendingState ? { ...fallback, ...selectPersistedState(pendingState) } : fallback
  const persisted = selectPersistedState(fallback)
  return Object.fromEntries(Object.keys(persisted).map((key) => [
    key,
    Array.isArray(persisted[key])
      ? (Array.isArray(pendingState?.[key]) ? pendingState[key] : Array.isArray(remoteState[key]) ? remoteState[key] : persisted[key])
      : (pendingState?.[key] ?? remoteState[key] ?? persisted[key]),
  ]))
}

export async function loadRemoteState(accessToken, spreadsheetId) {
  return loadPetCareState(accessToken, spreadsheetId)
}

export async function saveRemoteState(accessToken, spreadsheetId, state) {
  return savePetCareState(accessToken, spreadsheetId, selectPersistedState(state))
}
