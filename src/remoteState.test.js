import { describe, expect, it } from 'vitest'
import { hydrateRemoteState, selectPersistedState } from './remoteState.js'

describe('remote tracker state', () => {
  it('keeps the local seed state when a new Sheet has no app state', () => {
    const fallback = { tracks: [{ id: 'seed' }], logs: [], reminders: [] }
    expect(hydrateRemoteState(null, fallback)).toEqual(fallback)
  })

  it('only persists the state currently used by the UI', () => {
    const state = { tracks: [{ id: 't1' }], logs: [{ id: 'l1' }], reminders: [{ id: 'r1' }], transient: 'ignore' }
    expect(selectPersistedState(state)).toEqual({ tracks: state.tracks, logs: state.logs, reminders: state.reminders })
  })
})
