import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendSyncLog, clearSyncLog, getSyncLog, redactSyncErrorMessage, summarizeState } from './syncDebugLog.js'

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
    // 'symptoms' is deliberately excluded from the default id list: a
    // legacy string-form symptom's id is stableId('symptom', label), an
    // FNV-1a hash of the (small, guessable) Thai symptom vocabulary — so it
    // is effectively reversible and would leak which symptoms a pet has.
    // counts.symptoms above already covers diagnosing record loss.
    expect(summary.ids).toEqual({
      logs: ['log_1', 'log_2'],
      activities: ['activity_1'],
    })
    expect(summary.ids.symptoms).toBeUndefined()
    // Only id-lists for idKeys — no diary/label content anywhere in the summary.
    expect(JSON.stringify(summary)).not.toContain('label')
  })

  it('summarizeState returns all-zero counts and empty id arrays for undefined state', () => {
    const summary = summarizeState(undefined)
    expect(summary.counts).toEqual({
      logs: 0, symptoms: 0, activities: 0, tracks: 0, pets: 0, reminders: 0, treatmentHistory: 0,
    })
    expect(summary.ids).toEqual({ logs: [], activities: [] })
  })

  it('summarizeState never includes symptom ids even when explicitly requested via idKeys default', () => {
    // Regression guard: the default idKeys must not be reintroduced with 'symptoms'.
    const summary = summarizeState({ symptoms: [{ id: 'symptom_1' }] })
    expect(Object.keys(summary.ids)).not.toContain('symptoms')
  })

  it('summarizeState tolerates missing keys and does not throw', () => {
    expect(() => summarizeState({})).not.toThrow()
    expect(() => summarizeState(null)).not.toThrow()
  })

  it('summarizeState only includes ids for the requested idKeys', () => {
    const summary = summarizeState({ tracks: [{ id: 'track_1' }] }, { idKeys: ['tracks'] })
    expect(summary.ids).toEqual({ tracks: ['track_1'] })
  })

  it('redactSyncErrorMessage strips a full spreadsheet id embedded in an API error path', () => {
    const message = 'Google API error (429) [429 /v4/spreadsheets/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/values:batchUpdate]'
    const redacted = redactSyncErrorMessage(message)
    expect(redacted).not.toContain('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms')
    expect(redacted).toBe('Google API error (429) [429 /v4/spreadsheets/…/values:batchUpdate]')
  })

  it('redactSyncErrorMessage strips a full Drive file id embedded in an error path', () => {
    const message = 'Google API error (404) [404 /drive/v3/files/1AbCdEfGhIjKlMnOpQrStUvWxYz]'
    const redacted = redactSyncErrorMessage(message)
    expect(redacted).not.toContain('1AbCdEfGhIjKlMnOpQrStUvWxYz')
    expect(redacted).toBe('Google API error (404) [404 /drive/v3/files/…]')
  })

  it('redactSyncErrorMessage leaves an id-free message unchanged', () => {
    expect(redactSyncErrorMessage('Network request failed')).toBe('Network request failed')
  })

  it('redactSyncErrorMessage tolerates null/undefined without throwing', () => {
    expect(redactSyncErrorMessage(undefined)).toBe('')
    expect(redactSyncErrorMessage(null)).toBe('')
  })

  it('appendSyncLog drops the oldest entries to keep the serialized log under the byte cap', () => {
    // Each entry carries a sizeable id list (as connect_merged would for a
    // large state) so the byte cap — not the 200-entry count cap — is what
    // forces the trim here.
    const bigIds = Array.from({ length: 200 }, (_, i) => `log_${1700000000000 + i}_${'x'.repeat(20)}`)
    for (let i = 0; i < 50; i += 1) {
      appendSyncLog('connect_merged', { i, merged: { ids: { logs: bigIds } } })
    }
    const log = getSyncLog()
    const serialized = JSON.stringify(log)
    expect(serialized.length).toBeLessThanOrEqual(200_000)
    // The newest entry must survive the trim.
    expect(log[log.length - 1].i).toBe(49)
    // Some oldest entries were dropped to make room.
    expect(log.length).toBeLessThan(50)
    expect(log[0].i).toBeGreaterThan(0)
  })
})
