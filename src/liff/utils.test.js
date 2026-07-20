import { afterEach, describe, expect, it, vi } from 'vitest'
import { initLiff, LIFF_IDS, linkGoogleSheet, nowLocalISO, sendToGAS } from './utils.js'

afterEach(() => {
  LIFF_IDS.log = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('authenticated LIFF/GAS transport', () => {
  it('fails visibly when a LIFF id is missing', async () => {
    await expect(initLiff('log')).rejects.toThrow('LIFF ID')
  })

  it('sends authenticated POST and rejects an HTTP 200 error payload', async () => {
    LIFF_IDS.log = 'liff-test'
    vi.stubGlobal('liff', {
      init: vi.fn(),
      isLoggedIn: () => true,
      getAccessToken: () => 'line-token',
    })
    await initLiff('log')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'error', message: 'unauthorized resource' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendToGAS({ action: 'deleteLog', id: 'log-1' }, 'https://gas.test/exec')).rejects.toThrow('unauthorized resource')
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer line-token' }),
    }))
  })

  it('uses local wall-clock semantics for datetime-local values', () => {
    const value = nowLocalISO()
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    const now = new Date()
    expect(value.slice(0, 10)).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`)
  })

  it('uses the authenticated transport for explicit Google account linking', async () => {
    LIFF_IDS.log = 'liff-test'
    vi.stubGlobal('liff', { init: vi.fn(), isLoggedIn: () => true, getAccessToken: () => 'line-token' })
    await initLiff('log')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', spreadsheet_id: 'sheet-1' }) })
    vi.stubGlobal('fetch', fetchMock)
    await linkGoogleSheet('google-token', 'sheet-1', 'https://gas.test/exec')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ action: 'linkGoogleSheet', google_access_token: 'google-token', spreadsheet_id: 'sheet-1' })
  })
})
