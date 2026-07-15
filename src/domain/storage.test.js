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
})
