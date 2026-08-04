import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendSyncLog, clearSyncLog, getSyncLog, summarizeState } from './syncDebugLog.js'

const KEY = 'petcare.sync-debug-log.v1'

describe('syncDebugLog', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('caps the ring buffer at 200 entries, dropping the oldest first', () => {
    for (let i = 0; i < 205; i += 1) appendSyncLog('event', { i })
    const log = getSyncLog()
    expect(log).toHaveLength(200)
    // The oldest 5 (i = 0..4) were dropped; the newest kept, ending at i = 204.
    expect(log[0].i).toBe(5)
    expect(log[log.length - 1].i).toBe(204)
  })

  it('getSyncLog returns [] when the key is absent', () => {
    expect(getSyncLog()).toEqual([])
  })

  it('getSyncLog returns [] when the stored value is invalid JSON', () => {
    window.localStorage.setItem(KEY, '{not valid json')
    expect(getSyncLog()).toEqual([])
  })

  it('appendSyncLog does not throw when localStorage.setItem throws', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => appendSyncLog('boot', { mode: 'none' })).not.toThrow()
    setItemSpy.mockRestore()
  })

  it('appendSyncLog writes an entry with a ts and the given event/details', () => {
    appendSyncLog('boot', { mode: 'google' })
    const log = getSyncLog()
    expect(log).toHaveLength(1)
    expect(log[0].event).toBe('boot')
    expect(log[0].mode).toBe('google')
    expect(typeof log[0].ts).toBe('string')
    expect(Number.isNaN(new Date(log[0].ts).valueOf())).toBe(false)
  })

  it('clearSyncLog removes the stored key', () => {
    appendSyncLog('boot', {})
    expect(getSyncLog()).toHaveLength(1)
    clearSyncLog()
    expect(getSyncLog()).toEqual([])
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('summarizeState returns counts and id lists for a populated state', () => {
    const state = {
      logs: [{ id: 'log_1' }, { id: 'log_2' }],
      symptoms: [{ id: 'symptom_1' }],
      activities: [{ id: 'activity_1' }, { id: '' }, { id: null }],
      tracks: [{ id: 't1' }],
      pets: [{ id: 'p1' }, { id: 'p2' }],
      reminders: [],
      treatmentHistory: [{ id: 'th1' }],
    }
    const summary = summarizeState(state)
    expect(summary.counts).toEqual({
      logs: 2, symptoms: 1, activities: 3, tracks: 1, pets: 2, reminders: 0, treatmentHistory: 1,
    })
    expect(summary.ids).toEqual({
      logs: ['log_1', 'log_2'],
      symptoms: ['symptom_1'],
      activities: ['activity_1'],
    })
    // Only id-lists for idKeys — no diary/label content anywhere in the summary.
    expect(JSON.stringify(summary)).not.toContain('label')
  })

  it('summarizeState returns all-zero counts and empty id arrays for undefined state', () => {
    const summary = summarizeState(undefined)
    expect(summary.counts).toEqual({
      logs: 0, symptoms: 0, activities: 0, tracks: 0, pets: 0, reminders: 0, treatmentHistory: 0,
    })
    expect(summary.ids).toEqual({ logs: [], symptoms: [], activities: [] })
  })

  it('summarizeState tolerates missing keys and does not throw', () => {
    expect(() => summarizeState({})).not.toThrow()
    expect(() => summarizeState(null)).not.toThrow()
  })

  it('summarizeState only includes ids for the requested idKeys', () => {
    const summary = summarizeState({ tracks: [{ id: 'track_1' }] }, { idKeys: ['tracks'] })
    expect(summary.ids).toEqual({ tracks: ['track_1'] })
  })
})
