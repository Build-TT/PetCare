import { loadAppState, saveAppState } from './googleSheets.js'

export function selectPersistedState(state) {
  return {
    tracks: state.tracks || [],
    logs: state.logs || [],
    reminders: state.reminders || [],
  }
}

export function hydrateRemoteState(remoteState, fallback) {
  return remoteState && typeof remoteState === 'object'
    ? { ...fallback, ...selectPersistedState(remoteState) }
    : fallback
}

export async function loadRemoteState(accessToken, spreadsheetId) {
  return loadAppState(accessToken, spreadsheetId)
}

export async function saveRemoteState(accessToken, spreadsheetId, state) {
  return saveAppState(accessToken, spreadsheetId, selectPersistedState(state))
}
