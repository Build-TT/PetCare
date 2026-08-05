import { describe, expect, it } from 'vitest'
import { loadStoredState, saveStoredState } from './storage.js'

describe('stored app state', () => {
  it('returns the supplied fallback when storage is empty', () => {
    const storage = { getItem: () => null }
    expect(loadStoredState(storage, 'petcare', { logs: [] })).toEqual({ logs: [] })
  })

  it('round-trips serializable state through storage', () => {
    let saved = null
    const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value } }
    saveStoredState(storage, 'petcare', { logs: [{ id: 'log_1' }] })
    expect(loadStoredState(storage, 'petcare', {})).toEqual({ logs: [{ id: 'log_1' }] })
  })

  it('reports a successful write', () => {
    const storage = { getItem: () => null, setItem: () => undefined }
    expect(saveStoredState(storage, 'petcare', { logs: [] })).toBe(true)
  })

  // A throwing setItem (quota exhaustion is the realistic case — this app
  // stores compressed photos) used to propagate out of the calling useEffect
  // and, with no error boundary above it, unmount the entire app.
  it('does not throw when the underlying write fails', () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError') },
    }
    expect(() => saveStoredState(storage, 'petcare', { logs: [{ id: 'log_1' }] })).not.toThrow()
  })

  it('reports a failed write', () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError') },
    }
    expect(saveStoredState(storage, 'petcare', { logs: [{ id: 'log_1' }] })).toBe(false)
  })
})
