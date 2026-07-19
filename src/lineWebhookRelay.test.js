import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'
import vm from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'

import lineWebhook from '../api/line/webhook.js'

function requestFor(body, signature) {
  const request = Readable.from([body])
  request.method = 'POST'
  request.headers = { 'x-line-signature': signature }
  return request
}

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

describe('Vercel LINE webhook relay', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('acknowledges a signed LINE verification request without calling GAS', async () => {
    const channelSecret = '0123456789abcdef0123456789abcdef'
    const body = JSON.stringify({ destination: 'U123', events: [] })
    const signature = crypto.createHmac('sha256', channelSecret).update(body, 'utf8').digest('base64')
    vi.stubEnv('LINE_CHANNEL_SECRET', channelSecret)
    vi.stubEnv('VITE_GAS_URL', 'https://script.google.com/macros/s/test/exec')
    vi.stubEnv('GAS_WEBHOOK_SECRET', 'relay-secret')

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = responseRecorder()
    await lineWebhook(requestFor(body, signature), response)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('follows the GAS ContentService redirect with GET for a signed group event', async () => {
    const channelSecret = '0123456789abcdef0123456789abcdef'
    const body = JSON.stringify({
      destination: 'U123',
      events: [{ type: 'join', source: { type: 'group', groupId: 'C12345678901234567890123456789ab' } }],
    })
    const signature = crypto.createHmac('sha256', channelSecret).update(body, 'utf8').digest('base64')
    vi.stubEnv('LINE_CHANNEL_SECRET', channelSecret)
    vi.stubEnv('VITE_GAS_URL', 'https://script.google.com/macros/s/test/exec')
    vi.stubEnv('GAS_WEBHOOK_SECRET', 'relay-secret')

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 302, headers: { get: () => 'https://script.googleusercontent.com/macros/echo' } })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({ status: 'ok' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const response = responseRecorder()
    await lineWebhook(requestFor(body, signature), response)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('https://script.googleusercontent.com/macros/echo')
    expect(fetchMock.mock.calls[1][1].method).toBe('GET')
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined()
  })

  it('rejects a request with an invalid LINE signature before calling GAS', async () => {
    vi.stubEnv('LINE_CHANNEL_SECRET', 'correct-secret')
    vi.stubEnv('VITE_GAS_URL', 'https://script.google.com/macros/s/test/exec')
    vi.stubEnv('GAS_WEBHOOK_SECRET', 'relay-secret')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = responseRecorder()
    await lineWebhook(requestFor(JSON.stringify({ events: [] }), 'invalid'), response)

    expect(response.statusCode).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('GAS LINE webhook relay', () => {
  it('requires the shared relay secret and stores valid group IDs', () => {
    const code = readFileSync(resolve(process.cwd(), 'gas/Code.gs'), 'utf8')
    const properties = { GAS_WEBHOOK_SECRET: 'relay-secret' }
    const sandbox = {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: key => properties[key] || '',
          setProperty: (key, value) => {
            properties[key] = value
          },
        }),
      },
      ContentService: {
        MimeType: { JSON: 'json' },
        createTextOutput: value => ({
          value,
          setMimeType() {
            return this
          },
        }),
      },
    }
    vm.createContext(sandbox)
    vm.runInContext(code, sandbox)

    const payload = {
      events: [{ type: 'join', source: { type: 'group', groupId: 'C12345678901234567890123456789ab' } }],
    }
    const accepted = sandbox.doPost({
      postData: {
        contents: JSON.stringify({ action: 'lineWebhookRelay', relay_secret: 'relay-secret', payload }),
      },
    })
    expect(JSON.parse(accepted.value)).toMatchObject({ status: 'ok', event_count: 1, group_count: 1 })
    expect(JSON.parse(properties.PETCARE_LINE_GROUPS)).toHaveProperty('C12345678901234567890123456789ab')

    const rejected = sandbox.doPost({
      postData: {
        contents: JSON.stringify({ action: 'lineWebhookRelay', relay_secret: 'wrong', payload }),
      },
    })
    expect(JSON.parse(rejected.value).message).toContain('Invalid GAS webhook relay secret')
  })

  it('claims a captured group for a Google account and sets the active reminder target', () => {
    const code = readFileSync(resolve(process.cwd(), 'gas/Code.gs'), 'utf8')
    const groupId = 'C12345678901234567890123456789ab'
    const properties = {
      GAS_WEBHOOK_SECRET: 'relay-secret',
      PETCARE_LINE_GROUPS: JSON.stringify({
        [groupId]: {
          group_id: groupId,
          group_name: 'ครอบครัวโมจิ',
          status: 'active',
          created_at: '2026-07-19T10:00',
          updated_at: '2026-07-19T10:00',
        },
      }),
    }
    const sandbox = {
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: key => properties[key] || '',
          setProperty: (key, value) => {
            properties[key] = value
          },
        }),
      },
      ContentService: {
        MimeType: { JSON: 'json' },
        createTextOutput: value => ({
          value,
          setMimeType() {
            return this
          },
        }),
      },
    }
    vm.createContext(sandbox)
    vm.runInContext(code, sandbox)

    const result = sandbox.doPost({
      postData: {
        contents: JSON.stringify({
          action: 'selectLineGroup',
          relay_secret: 'relay-secret',
          owner_email: 'Owner@Example.com',
          group_id: groupId,
        }),
      },
    })
    const body = JSON.parse(result.value)

    expect(body).toMatchObject({ status: 'ok', selected_group_id: groupId })
    expect(body.groups[0]).toMatchObject({ group_id: groupId, group_name: 'ครอบครัวโมจิ', selected: true })
    expect(properties.TARGET_ID).toBe(groupId)
    expect(JSON.parse(properties.PETCARE_LINE_GROUP_SELECTIONS)).toEqual({ 'owner@example.com': groupId })
    expect(JSON.parse(properties.PETCARE_LINE_GROUPS)[groupId].owner_email).toBe('owner@example.com')
  })
})
