import { describe, expect, it } from 'vitest'
import { hydrateRemoteState, isCurrentRemoteRevision, selectPersistedState, unwrapPendingState } from './remoteState.js'

describe('remote tracker state', () => {
  it('never serializes the demo pet as persisted account or Sheet data', () => {
    expect(selectPersistedState({ pets: [{ id: 'demo', demo: true }, { id: 'real', name: 'Mochi' }] }).pets).toEqual([{ id: 'real', name: 'Mochi' }])
  })
  it('keeps the local seed state when a new Sheet has no app state', () => {
    const fallback = { tracks: [{ id: 'seed' }], logs: [], reminders: [], symptoms: ['ซึม'] }
    expect(hydrateRemoteState(null, fallback)).toEqual(fallback)
  })

  it('only persists the state currently used by the UI', () => {
    const state = { tracks: [{ id: 't1' }], logs: [{ id: 'l1' }], activities: [{ id: 'a1' }], reminders: [{ id: 'r1' }], symptoms: ['ซึม'], pets: [{ id: 'p1' }], treatmentHistory: [{ id: 'h1' }], lineRecipients: [{ id: 'rr1' }], activePetId: 'p1', transient: 'ignore' }
    expect(selectPersistedState(state)).toEqual({ tracks: state.tracks, logs: state.logs, activities: state.activities, reminders: state.reminders, symptoms: state.symptoms, pets: state.pets, treatmentHistory: state.treatmentHistory, lineRecipients: state.lineRecipients, activePetId: state.activePetId })
  })

  it('keeps every local collection when the remote state is partial', () => {
    const fallback = { tracks: [{ id: 't1' }], logs: [{ id: 'l1' }], activities: [{ id: 'a1' }], reminders: [{ id: 'r1' }], symptoms: ['ซึม'], pets: [{ id: 'p1' }], activePetId: 'p1' }
    expect(hydrateRemoteState({ logs: [{ id: 'remote' }] }, fallback)).toEqual({ ...fallback, logs: [{ id: 'remote' }], treatmentHistory: [], lineRecipients: [] })
  })

  it('lets a pending local outbox win over stale remote collections', () => {
    const fallback = { tracks: [], logs: [], activities: [], reminders: [], symptoms: [], pets: [{ id: 'p1' }], activePetId: 'p1' }
    const pending = { logs: [{ id: 'local-new' }], reminders: [{ id: 'local-reminder' }] }
    const remote = { logs: [{ id: 'stale-remote' }], reminders: [{ id: 'stale-reminder' }], pets: [{ id: 'p1' }] }
    const hydrated = hydrateRemoteState(remote, fallback, pending)
    expect(hydrated.logs).toEqual(pending.logs)
    expect(hydrated.reminders).toEqual(pending.reminders)
  })

  it('does not let an older successful remote save clear a newer failed-write outbox', () => {
    let currentRevision = 0
    let outbox = null
    const olderRequest = ++currentRevision
    const newerRequest = ++currentRevision
    if (isCurrentRemoteRevision(currentRevision, olderRequest)) outbox = null
    if (isCurrentRemoteRevision(currentRevision, newerRequest)) outbox = { revision: newerRequest, state: { logs: [{ id: 'newer' }] } }
    expect(outbox).toEqual({ revision: 2, state: { logs: [{ id: 'newer' }] } })
    expect(unwrapPendingState(outbox)).toEqual({ logs: [{ id: 'newer' }] })
  })

  it('hydrates the edit made before debounce from the outbox after reconnect', () => {
    const fallback = { tracks: [], logs: [], activities: [], reminders: [], symptoms: [], pets: [{ id: 'p1' }], activePetId: 'p1' }
    const edited = { ...fallback, logs: [{ id: 'edited-before-debounce' }] }
    const pendingSnapshot = { revision: 7, state: edited }
    const reloaded = hydrateRemoteState({ ...fallback, logs: [{ id: 'stale-remote' }] }, fallback, unwrapPendingState(pendingSnapshot))
    expect(reloaded.logs).toEqual(edited.logs)
    expect(isCurrentRemoteRevision(8, pendingSnapshot.revision)).toBe(false)
  })

  it('ignores reversed resolve/reject completions for sync status', () => {
    let currentRevision = 2
    let status = 'pending'
    let error = ''
    const oldSuccess = 1
    const newFailure = 2
    if (isCurrentRemoteRevision(currentRevision, oldSuccess)) status = 'saved'
    if (isCurrentRemoteRevision(currentRevision, newFailure)) { status = 'error'; error = 'new failure' }
    expect(status).toBe('error')
    expect(error).toBe('new failure')
    currentRevision = 3
    if (isCurrentRemoteRevision(currentRevision, oldSuccess)) status = 'saved'
    if (isCurrentRemoteRevision(currentRevision, newFailure)) { status = 'error'; error = 'old failure' }
    expect(status).toBe('error')
    expect(error).toBe('new failure')
  })
})
