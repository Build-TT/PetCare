import { afterEach, describe, expect, it, vi } from 'vitest'
import { provisionGoogleLineLink } from './gasProvisioning.js'

afterEach(() => vi.unstubAllGlobals())

describe('Google-to-LINE provisioning', () => {
  it('sends Google-authenticated provisioning data without a LINE token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok', linked: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await provisionGoogleLineLink({
      endpoint: 'https://gas.test/exec',
      accessToken: 'google-token',
      spreadsheetId: 'sheet-1',
      lineUserId: 'U1234567890abcdef1234567890abcdef',
    })
    expect(fetchMock).toHaveBeenCalledWith('https://gas.test/exec', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: 'provisionUser',
      google_access_token: 'google-token',
      spreadsheet_id: 'sheet-1',
      line_user_id: 'U1234567890abcdef1234567890abcdef',
    })
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('rejects malformed LINE IDs before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(provisionGoogleLineLink({ endpoint: 'https://gas.test/exec', accessToken: 'google-token', spreadsheetId: 'sheet-1', lineUserId: 'not-a-line-id' })).rejects.toThrow('LINE User ID')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
