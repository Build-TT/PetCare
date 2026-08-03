import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAccountSession, getAccountSession, saveAccountSession } from './accountAuth.js'

const session = { session_token: 'remembered-token', user: { username: 'pet-owner' } }

describe('account session persistence', () => {
  beforeEach(() => clearAccountSession())

  it('restores a remembered session from local storage after refresh', () => {
    saveAccountSession(session, window.localStorage)
    expect(getAccountSession()).toEqual(session)
  })

  it('restores a non-remembered session from session storage', () => {
    saveAccountSession(session, window.sessionStorage)
    expect(getAccountSession()).toEqual(session)
  })

  it('clears both storage locations on logout', () => {
    saveAccountSession(session, window.localStorage)
    saveAccountSession(session, window.sessionStorage)
    clearAccountSession()
    expect(getAccountSession()).toBeNull()
  })
})

describe('account backend errors', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function loadWithFetch(response) {
    vi.stubEnv('VITE_GAS_URL', 'https://script.google.com/macros/s/dead-deployment/exec')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    vi.resetModules()
    return import('./accountAuth.js')
  }

  it('names the dead Apps Script deployment when the backend URL answers 404', async () => {
    // A live doPost always answers 200 with JSON, so a 404 means the /exec URL
    // itself is gone — the generic message sent people hunting the wrong bug.
    const { loadAccountState } = await loadWithFetch({ ok: false, status: 404, json: () => Promise.reject(new Error('not json')) })
    await expect(loadAccountState('session-token')).rejects.toThrow(
      'ไม่พบปลายทาง Apps Script (404) — URL ของ backend อาจเปลี่ยนหลัง redeploy กรุณาตรวจค่า VITE_GAS_URL ใน Vercel ให้ตรงกับ Web app URL ปัจจุบัน',
    )
  })

  it('keeps the backend message for other failing statuses', async () => {
    const { loadAccountState } = await loadWithFetch({ ok: false, status: 500, json: () => Promise.resolve({ status: 'error', message: 'boom' }) })
    await expect(loadAccountState('session-token')).rejects.toThrow('boom')
  })
})
