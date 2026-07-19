import { afterEach, describe, expect, it, vi } from 'vitest'

import lineGroups from '../api/line/groups.js'

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

describe('Vercel LINE group service', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('requires a Google access token', async () => {
    vi.stubEnv('VITE_GAS_URL', 'https://script.google.com/macros/s/test/exec')
    vi.stubEnv('GAS_WEBHOOK_SECRET', 'relay-secret')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = responseRecorder()

    await lineGroups({ method: 'GET', headers: {} }, response)

    expect(response.statusCode).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verifies Google and follows the Apps Script ContentService redirect', async () => {
    vi.stubEnv('VITE_GAS_URL', 'https://script.google.com/macros/s/test/exec')
    vi.stubEnv('GAS_WEBHOOK_SECRET', 'relay-secret')
    const groups = [{ group_id: 'C123', group_name: 'ครอบครัวโมจิ', selected: false }]
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ email: 'Owner@Example.com' }) })
      .mockResolvedValueOnce({ status: 302, headers: { get: () => 'https://script.googleusercontent.com/macros/echo' } })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({ status: 'ok', groups, selected_group_id: '' }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const response = responseRecorder()

    await lineGroups({ method: 'GET', headers: { authorization: 'Bearer google-token' } }, response)

    expect(response.statusCode).toBe(200)
    expect(response.body.groups).toEqual(groups)
    expect(fetchMock.mock.calls[1][1].body).toContain('"owner_email":"owner@example.com"')
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'GET', redirect: 'manual' })
  })

  it('sends the chosen group to Apps Script', async () => {
    vi.stubEnv('VITE_GAS_URL', 'https://script.google.com/macros/s/test/exec')
    vi.stubEnv('GAS_WEBHOOK_SECRET', 'relay-secret')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ email: 'owner@example.com' }) })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({ status: 'ok', groups: [], selected_group_id: 'C123' }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const response = responseRecorder()

    await lineGroups({
      method: 'POST',
      headers: { authorization: 'Bearer google-token' },
      body: { group_id: 'C123' },
    }, response)

    expect(response.statusCode).toBe(200)
    expect(fetchMock.mock.calls[1][1].body).toContain('"action":"selectLineGroup"')
    expect(fetchMock.mock.calls[1][1].body).toContain('"group_id":"C123"')
  })
})
