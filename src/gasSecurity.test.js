import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

function makeGasSandbox({ properties = {}, fetchImpl, openById, sessionEmail = 'gas-owner@example.com', mailImpl } = {}) {
  const calls = []
  const logs = []
  const propertyWrites = []
  const sandbox = {
    console,
    Logger: { log: value => logs.push(value) },
    Session: { getEffectiveUser: () => ({ getEmail: () => sessionEmail }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties[key] || '',
      getProperties: () => ({ ...properties }),
      setProperty: (key, value) => { propertyWrites.push({ key, value }); properties[key] = value },
    }) },
    UrlFetchApp: { fetch: (url, options) => { calls.push({ url, options }); return fetchImpl(url, options) } },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: value => ({ value, setMimeType: () => ({ value }) }) },
    Utilities: {
      computeHmacSha256Signature: (body, secret) => [String(body).length, String(secret).length, 7],
      base64Encode: bytes => bytes.join('-'),
    },
    SpreadsheetApp: { openById: id => openById ? openById(id) : ({ getSheetByName: () => null }) },
    ScriptApp: {},
    MailApp: { sendEmail: (...args) => mailImpl?.(...args) },
  }
  vm.runInNewContext(readFileSync(path.resolve('gas', 'Code.gs'), 'utf8'), sandbox)
  return { sandbox, calls, logs, propertyWrites }
}

const response = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body) })

describe('GAS security behavior', () => {
  it('does not let a password registration capture an invite for another email', () => {
    const { sandbox } = makeGasSandbox({
      properties: { PETCARE_ACCOUNT_USERS: JSON.stringify({ __invite__CODE123: { email: 'invited@example.com', spreadsheet_id: 'sheet-1', role: 'writer' } }) },
    })
    sandbox.accountToken = vi.fn(() => 'token123456789')
    expect(() => sandbox.registerAccount({ username: 'attacker', password: 'password123', name: 'A', surname: 'User', email: 'attacker@example.com', invite_code: 'CODE123' })).toThrow('does not match')
    expect(sandbox.accountStore('PETCARE_ACCOUNT_USERS')).toHaveProperty('__invite__CODE123')
  })

  it('round-trips invited writes through the normalized tabs used by Google owners and reminders', () => {
    const { sandbox } = makeGasSandbox()
    const objects = sandbox.accountStateObjects({
      pets: [{ id: 'p1', name: 'Mochi' }],
      reminders: [{ id: 'r1', title: 'Medicine', enabled: true, schedule_config: { time: '08:00' } }],
      lineRecipients: [{ id: 'rr1', reminder_id: 'r1', recipient_id: 'line-recipient' }],
    }, 'timestamp')
    expect(objects.pets[0]).toMatchObject({ id: 'p1', name: 'Mochi' })
    expect(objects.reminders[0]).toMatchObject({ id: 'r1', active: true })
    expect(objects.reminder_recipients[0]).toMatchObject({ reminder_id: 'r1', recipient_id: 'line-recipient' })
  })

  it('rejects every account write for reader accounts and includes locking/throttling guards', () => {
    const { sandbox } = makeGasSandbox()
    expect(sandbox.accountCanWrite({ role: 'reader' })).toBe(false)
    expect(sandbox.accountCanWrite({ role: 'writer' })).toBe(true)
    expect(readFileSync(path.resolve('gas', 'Code.gs'), 'utf8')).toMatch(/withAccountLock[\s\S]*ACCOUNT_THROTTLE_PROPERTY/)
    sandbox.CURRENT_ACCOUNT_USER = { role: 'reader', spreadsheet_id: 'sheet-1' }
    sandbox.accountWriteNormalizedState = vi.fn()
    expect(() => sandbox.accountSaveState({})).toThrow('อ่านอย่างเดียว')
    expect(sandbox.accountWriteNormalizedState).not.toHaveBeenCalled()
  })
  it('makes a new invitation idempotent and exposes MailApp failure without losing the pending code', () => {
    const { sandbox, propertyWrites } = makeGasSandbox({
      properties: { PETCARE_ACCOUNT_USERS: '{}' },
      fetchImpl: () => response(200, { id: 'sheet-1', name: 'Sheet', mimeType: 'application/vnd.google-apps.spreadsheet', owners: [{ emailAddress: 'owner@example.com' }] }),
      mailImpl: () => { throw new Error('quota exceeded') },
    })
    sandbox.setupSheets = vi.fn()
    sandbox.getGoogleOwnedSpreadsheet = vi.fn(() => ({ id: 'sheet-1', name: 'Sheet' }))
    sandbox.shareWithScriptIdentity = vi.fn()
    sandbox.accountToken = vi.fn(() => 'token123456789')
    sandbox.accountToken = vi.fn(() => 'token123456789')
    const first = sandbox.inviteAccount({ spreadsheet_id: 'sheet-1', google_access_token: 'token', email: 'user@example.com' }, { email: 'owner@example.com', sub: 'owner' })
    const second = sandbox.inviteAccount({ spreadsheet_id: 'sheet-1', google_access_token: 'token', email: 'USER@example.com' }, { email: 'owner@example.com', sub: 'owner' })
    expect(first.email_sent).toBe(false)
    expect(first.email_error).toContain('share the Invite code')
    expect(second.invite_code).toBe(first.invite_code)
    expect(propertyWrites.filter(item => item.key === 'PETCARE_ACCOUNT_USERS')).toHaveLength(1)
  })

  it('emails an existing Google-verified account after linking it without an invite code', () => {
    const mailImpl = vi.fn()
    const { sandbox } = makeGasSandbox({
      properties: { PETCARE_ACCOUNT_USERS: JSON.stringify({ existing: { username: 'existing', email: 'user@example.com', active: true, spreadsheet_id: '', google_sub: 'google-user' } }) },
      fetchImpl: () => response(200, {}),
      mailImpl,
    })
    sandbox.setupSheets = vi.fn()
    sandbox.getGoogleOwnedSpreadsheet = vi.fn(() => ({ id: 'sheet-1', name: 'Family pets' }))
    sandbox.shareWithScriptIdentity = vi.fn()

    const result = sandbox.inviteAccount({ spreadsheet_id: 'sheet-1', google_access_token: 'token', email: 'user@example.com', role: 'reader', app_url: 'https://petcare.example/' }, { email: 'owner@example.com', sub: 'owner' })

    expect(result).toMatchObject({ existing_account: true, role: 'reader', email_sent: true, email_error: '' })
    expect(result.invite_code).toBeUndefined()
    expect(mailImpl).toHaveBeenCalledTimes(1)
    const [recipient, subject, body] = mailImpl.mock.calls[0]
    expect(recipient).toBe('user@example.com')
    expect(subject).toBe('PetCare access granted')
    expect(body).toContain('Family pets')
    expect(body).toContain('Role: reader')
    expect(body).toContain('https://petcare.example')
    expect(body).toContain('Login with Google')
    expect(body).not.toContain('Invite code:')
  })

  it('keeps an existing Google account linked and reports notification email failure', () => {
    const { sandbox, logs } = makeGasSandbox({
      properties: { PETCARE_ACCOUNT_USERS: JSON.stringify({ existing: { username: 'existing', email: 'user@example.com', active: true, spreadsheet_id: '', google_sub: 'google-user' } }) },
      fetchImpl: () => response(200, {}),
      mailImpl: () => { throw new Error('mail quota exceeded') },
    })
    sandbox.setupSheets = vi.fn()
    sandbox.getGoogleOwnedSpreadsheet = vi.fn(() => ({ id: 'sheet-1', name: 'Family pets' }))
    sandbox.shareWithScriptIdentity = vi.fn()

    const result = sandbox.inviteAccount({ spreadsheet_id: 'sheet-1', google_access_token: 'token', email: 'user@example.com', role: 'writer', app_url: 'https://petcare.example' }, { email: 'owner@example.com', sub: 'owner' })

    expect(result).toMatchObject({ existing_account: true, role: 'writer', email_sent: false })
    expect(result.email_error).toContain('can log in with Google')
    expect(result.invite_code).toBeUndefined()
    expect(sandbox.accountStore('PETCARE_ACCOUNT_USERS').existing.spreadsheet_id).toBe('sheet-1')
    expect(logs.some(entry => String(entry).includes('PetCare existing-account access email failed: mail quota exceeded'))).toBe(true)
  })

  it('does not bind an existing password account by email; it creates a deliberate pending invite', () => {
    const { sandbox } = makeGasSandbox({
      properties: { PETCARE_ACCOUNT_USERS: JSON.stringify({ existing: { username: 'existing', email: 'user@example.com', active: true, spreadsheet_id: '' } }) },
      fetchImpl: () => response(200, {}),
    })
    sandbox.setupSheets = vi.fn()
    sandbox.getGoogleOwnedSpreadsheet = vi.fn(() => ({ id: 'sheet-1', name: 'Sheet' }))
    sandbox.shareWithScriptIdentity = vi.fn()
    sandbox.accountToken = vi.fn(() => 'token123456789')
    const result = sandbox.inviteAccount({ spreadsheet_id: 'sheet-1', google_access_token: 'token', email: 'user@example.com' }, { email: 'owner@example.com', sub: 'owner' })
    expect(result.existing_account).toBeUndefined()
    expect(result.invite_code).toBeTruthy()
    expect(sandbox.shareWithScriptIdentity).toHaveBeenCalledWith('sheet-1', 'token')
    expect(sandbox.accountStore('PETCARE_ACCOUNT_USERS').existing.spreadsheet_id).toBe('')
  })

  it('revokes an account only when it belongs to the owner-selected Sheet', () => {
    const { sandbox } = makeGasSandbox({
      properties: { PETCARE_ACCOUNT_USERS: JSON.stringify({ existing: { username: 'existing', email: 'user@example.com', active: true, spreadsheet_id: 'sheet-1' } }) },
      fetchImpl: () => response(200, {}),
    })
    sandbox.getGoogleOwnedSpreadsheet = vi.fn(() => ({ id: 'sheet-1', name: 'Sheet' }))
    expect(sandbox.revokeAccount({ spreadsheet_id: 'sheet-1', username: 'existing', google_access_token: 'token' }, { email: 'owner@example.com' })).toEqual({ status: 'ok', revoked: true })
    expect(sandbox.accountStore('PETCARE_ACCOUNT_USERS').existing).toMatchObject({ active: false, status: 'revoked' })
  })

  it('cancels a pending invite idempotently and scopes it to the verified owner Sheet', () => {
    const { sandbox } = makeGasSandbox({
      properties: { PETCARE_ACCOUNT_USERS: JSON.stringify({ __invite__CODE123: { email: 'user@example.com', spreadsheet_id: 'sheet-1', owner_email: 'owner@example.com' } }) },
      fetchImpl: () => response(200, {}),
    })
    sandbox.getGoogleOwnedSpreadsheet = vi.fn(() => ({ id: 'sheet-1', name: 'Sheet' }))
    expect(sandbox.cancelInvite({ spreadsheet_id: 'sheet-1', invite_code: 'code123', google_access_token: 'token' }, { email: 'owner@example.com' })).toEqual({ status: 'ok', cancelled: true })
    expect(sandbox.cancelInvite({ spreadsheet_id: 'sheet-1', invite_code: 'code123', google_access_token: 'token' }, { email: 'owner@example.com' })).toEqual({ status: 'ok', cancelled: true, already_removed: true })
  })
  it('removes an active account or pending invite by verified email without relying on member-list state', () => {
    const { sandbox } = makeGasSandbox({
      properties: { PETCARE_ACCOUNT_USERS: JSON.stringify({
        active: { username: 'active', email: 'user@example.com', active: true, spreadsheet_id: 'sheet-1' },
        __invite__CODE123: { email: 'pending@example.com', spreadsheet_id: 'sheet-1', owner_email: 'owner@example.com' },
      }) },
      fetchImpl: () => response(200, {}),
    })
    sandbox.getGoogleOwnedSpreadsheet = vi.fn(() => ({ id: 'sheet-1', name: 'Sheet' }))
    expect(sandbox.removeAccountAccess({ spreadsheet_id: 'sheet-1', email: 'user@example.com' }, { email: 'owner@example.com' })).toMatchObject({ account_removed: true })
    expect(sandbox.removeAccountAccess({ spreadsheet_id: 'sheet-1', email: 'pending@example.com' }, { email: 'owner@example.com' })).toMatchObject({ invite_cancelled: true })
    expect(sandbox.removeAccountAccess({ spreadsheet_id: 'sheet-1', email: 'pending@example.com' }, { email: 'owner@example.com' })).toMatchObject({ already_removed: true })
  })
  it('turns an invited Google email into a real PetCare account with Sheet access', () => {
    const { sandbox } = makeGasSandbox({
      properties: {
        PETCARE_ACCOUNT_USERS: JSON.stringify({
          __invite__CODE123: { email: 'user@example.com', role: 'user', spreadsheet_id: 'sheet-shared', owner_email: 'owner@example.com' },
        }),
      },
      fetchImpl: () => response(200, {}),
    })
    sandbox.accountToken = vi.fn(() => 'token123456789')
    sandbox.verifyGoogleIdentity = vi.fn(() => ({ sub: 'google-user', email: 'user@example.com' }))

    const session = sandbox.googleLoginAccount({ google_access_token: 'google-token' })

    expect(session.status).toBe('ok')
    expect(session.user.email).toBe('user@example.com')
    expect(session.user.spreadsheet_id).toBe('sheet-shared')
    expect(session.user.username).toMatch(/^google-/)
    expect(sandbox.accountStore('PETCARE_ACCOUNT_USERS')).not.toHaveProperty('__invite__CODE123')
  })

  it('applies a later invite to an existing Google account before creating its session', () => {
    const { sandbox } = makeGasSandbox({
      properties: {
        PETCARE_ACCOUNT_USERS: JSON.stringify({
          existing: { username: 'existing', email: 'user@example.com', role: 'user', spreadsheet_id: '', active: true, google_sub: 'google-user' },
          __invite__CODE123: { email: 'user@example.com', role: 'user', spreadsheet_id: 'sheet-shared', owner_email: 'owner@example.com' },
        }),
      },
      fetchImpl: () => response(200, {}),
    })
    sandbox.accountToken = vi.fn(() => 'token123456789')
    sandbox.verifyGoogleIdentity = vi.fn(() => ({ sub: 'google-user', email: 'user@example.com' }))

    const session = sandbox.googleLoginAccount({ google_access_token: 'google-token' })

    expect(session.user.username).toBe('existing')
    expect(session.user.spreadsheet_id).toBe('sheet-shared')
    expect(sandbox.accountStore('PETCARE_ACCOUNT_USERS')).not.toHaveProperty('__invite__CODE123')
  })

  it('initializes the legacy migration backup alongside normalized sheets', () => {
    const { sandbox } = makeGasSandbox({ fetchImpl: () => response(200, {}) })
    expect(sandbox.SHEETS.app_state).toEqual(['key', 'value', 'updated_at'])
    expect(sandbox.SHEETS.tracking_items).toContain('id')
    expect(sandbox.SHEETS.symptom_logs).toContain('tracking_snapshot_json')
  })

  it('writes normalized account state only to the explicitly assigned spreadsheet context', () => {
    const { sandbox } = makeGasSandbox()
    const makeSheet = headers => {
      const rows = [headers.slice()]
      return {
        getLastRow: () => rows.length,
        getLastColumn: () => headers.length,
        getRange: (row, column, rowCount, columnCount) => ({
          getValues: () => rows.slice(row - 1, row - 1 + rowCount).map(item => item.slice(column - 1, column - 1 + columnCount)),
          clearContent: () => { rows.splice(row - 1, rowCount) },
          setValues: values => values.forEach((value, index) => { rows[row - 1 + index] = value.slice() }),
        }),
      }
    }
    const makeSpreadsheet = () => ({ sheets: Object.fromEntries(Object.entries(sandbox.SHEETS).map(([name, headers]) => [name, makeSheet(headers)])), getSheetByName(name) { return this.sheets[name] } })
    const first = makeSpreadsheet(); const second = makeSpreadsheet()
    sandbox.accountWriteNormalizedState({ pets: [{ id: 'only-first', name: 'Mochi' }] }, first)
    expect(first.getSheetByName('pets').getRange(1, 1, 2, 2).getValues()[1][0]).toBe('only-first')
    expect(second.getSheetByName('pets').getRange(1, 1, 1, 2).getValues()).toEqual([sandbox.SHEETS.pets.slice(0, 2)])
    const source = readFileSync(path.resolve('gas', 'Code.gs'), 'utf8')
    const writer = source.slice(source.indexOf('function accountWriteNormalizedState'), source.indexOf('function accountReadState'))
    expect(writer).toMatch(/function accountWriteNormalizedState\(state, spreadsheet\)/)
    expect(writer).not.toContain('getSheet(name)')
    expect(writer).not.toContain('appendRow')
    expect(writer).toContain('clearContent()')
    expect(writer).toContain('setValues(plan.rows)')
  })

  it('sets up the verified Sheet by id before publishing the per-LINE-user mapping', () => {
    const source = readFileSync(path.resolve('gas', 'Code.gs'), 'utf8')
    expect(source).toContain('function setupSheets(spreadsheetId)')
    expect(source).toContain('var ss = getSpreadsheet(spreadsheetId)')
    const setupIndex = source.indexOf('setupSheets(file.id)')
    const mappingIndex = source.indexOf("setProperty(USER_SHEET_PREFIX + CURRENT_LINE_USER_ID, file.id)")
    expect(setupIndex).toBeGreaterThan(-1)
    expect(mappingIndex).toBeGreaterThan(setupIndex)
  })

  it('reuses a verified existing LINE-user mapping without creating a Sheet or overwriting mapping properties', () => {
    const storedLink = { line_user_id: 'line-1', google_sub: 'google-1', google_email: 'owner@example.com', spreadsheet_id: 'sheet-existing' }
    const { sandbox, propertyWrites } = makeGasSandbox({
      properties: {
        PETCARE_USER_SHEET_line1: 'sheet-existing',
        PETCARE_USER_LINK_line1: JSON.stringify(storedLink),
      },
      fetchImpl: () => response(200, {}),
    })
    sandbox.CURRENT_LINE_USER_ID = 'line1'
    sandbox.verifyGoogleIdentity = vi.fn(() => ({ sub: 'google-1', email: 'owner@example.com' }))
    sandbox.getGoogleOwnedSpreadsheet = vi.fn(() => ({ id: 'sheet-existing', name: 'PetCare existing' }))
    sandbox.shareWithScriptIdentity = vi.fn()
    sandbox.setupSheets = vi.fn()
    sandbox.createGoogleSpreadsheet = vi.fn(() => { throw new Error('must not create') })

    const first = sandbox.linkGoogleSheet({ google_access_token: 'google-token' })
    const retry = sandbox.linkGoogleSheet({ google_access_token: 'google-token' })

    expect(first).toEqual({ status: 'ok', spreadsheet_id: 'sheet-existing', spreadsheet_name: 'PetCare existing', reused: true })
    expect(retry).toEqual(first)
    expect(sandbox.getGoogleOwnedSpreadsheet).toHaveBeenCalledTimes(2)
    expect(sandbox.getGoogleOwnedSpreadsheet).toHaveBeenCalledWith('sheet-existing', 'google-token', 'owner@example.com')
    expect(sandbox.createGoogleSpreadsheet).not.toHaveBeenCalled()
    expect(propertyWrites).toEqual([])
  })

  it('rejects a request to replace an existing LINE-user Sheet before opening, creating, or rewriting anything', () => {
    const storedLink = { line_user_id: 'line1', google_sub: 'google-1', google_email: 'owner@example.com', spreadsheet_id: 'sheet-existing' }
    const { sandbox, propertyWrites } = makeGasSandbox({
      properties: {
        PETCARE_USER_SHEET_line1: 'sheet-existing',
        PETCARE_USER_LINK_line1: JSON.stringify(storedLink),
      },
      fetchImpl: () => response(200, {}),
    })
    sandbox.CURRENT_LINE_USER_ID = 'line1'
    sandbox.verifyGoogleIdentity = vi.fn(() => ({ sub: 'google-1', email: 'owner@example.com' }))
    sandbox.getGoogleOwnedSpreadsheet = vi.fn()
    sandbox.createGoogleSpreadsheet = vi.fn()

    expect(() => sandbox.linkGoogleSheet({ google_access_token: 'google-token', spreadsheet_id: 'sheet-other' }))
      .toThrow('already linked to a different Google Sheet')
    expect(sandbox.getGoogleOwnedSpreadsheet).not.toHaveBeenCalled()
    expect(sandbox.createGoogleSpreadsheet).not.toHaveBeenCalled()
    expect(propertyWrites).toEqual([])
  })

  it('rejects relinking an existing LINE mapping from a different verified Google account without side effects', () => {
    const storedLink = { line_user_id: 'line1', google_sub: 'google-owner', google_email: 'owner@example.com', spreadsheet_id: 'sheet-existing' }
    const { sandbox, propertyWrites } = makeGasSandbox({
      properties: {
        PETCARE_USER_SHEET_line1: 'sheet-existing',
        PETCARE_USER_LINK_line1: JSON.stringify(storedLink),
      },
      fetchImpl: () => response(200, {}),
    })
    sandbox.CURRENT_LINE_USER_ID = 'line1'
    sandbox.verifyGoogleIdentity = vi.fn(() => ({ sub: 'google-other', email: 'other@example.com' }))
    sandbox.getGoogleOwnedSpreadsheet = vi.fn()
    sandbox.createGoogleSpreadsheet = vi.fn()

    expect(() => sandbox.linkGoogleSheet({ google_access_token: 'google-token' }))
      .toThrow('belongs to a different Google account')
    expect(sandbox.getGoogleOwnedSpreadsheet).not.toHaveBeenCalled()
    expect(sandbox.createGoogleSpreadsheet).not.toHaveBeenCalled()
    expect(propertyWrites).toEqual([])
  })

  it('uses LINE OAuth verification and rejects a token from a non-allowlisted Channel ID', () => {
    const { sandbox, calls } = makeGasSandbox({
      properties: { LINE_CHANNEL_IDS: 'channel-allowed' },
      fetchImpl: _url => response(200, { expires_in: 60, client_id: 'channel-other' }),
    })
    const result = sandbox.doPost({ postData: { contents: JSON.stringify({ action: 'readSheet', sheet: 'pets', access_token: 'token' }) } })
    expect(JSON.parse(result.value).message).toContain('not authorized')
    expect(calls[0].url).toContain('/oauth2/v2.1/verify')
    expect(calls).toHaveLength(1)
  })

  it('accepts a signed LINE group webhook and remembers the group ID', () => {
    const properties = { LINE_CHANNEL_SECRET: 'channel-secret' }
    const { sandbox, propertyWrites } = makeGasSandbox({ properties, fetchImpl: () => response(200, {}) })
    const body = JSON.stringify({
      destination: 'channel-id',
      events: [{ type: 'message', source: { type: 'group', groupId: 'C12345678901234567890123456789ab' } }],
    })
    const result = sandbox.doPost({
      headers: { 'X-Line-Signature': `${body.length}-14-7` },
      postData: { contents: body },
    })

    expect(JSON.parse(result.value)).toEqual({ status: 'ok', event_count: 1, group_count: 1 })
    const stored = propertyWrites.find(item => item.key === 'PETCARE_LINE_GROUPS')
    expect(JSON.parse(stored.value)['C12345678901234567890123456789ab']).toMatchObject({
      group_id: 'C12345678901234567890123456789ab',
      status: 'active',
      last_event: 'message',
    })
  })

  it('rejects an unsigned or tampered LINE group webhook', () => {
    const { sandbox } = makeGasSandbox({ properties: { LINE_CHANNEL_SECRET: 'channel-secret' }, fetchImpl: () => response(200, {}) })
    const body = JSON.stringify({ events: [{ type: 'join', source: { type: 'group', groupId: 'C12345678901234567890123456789ab' } }] })
    const result = sandbox.doPost({ headers: { 'X-Line-Signature': 'wrong' }, postData: { contents: body } })
    expect(JSON.parse(result.value).message).toContain('Invalid LINE webhook signature')
  })

  it('accepts only relayed group webhooks with the shared GAS relay secret', () => {
    const properties = { GAS_WEBHOOK_SECRET: 'relay-secret' }
    const { sandbox, propertyWrites } = makeGasSandbox({ properties, fetchImpl: () => response(200, {}) })
    const payload = { events: [{ type: 'join', source: { type: 'group', groupId: 'C12345678901234567890123456789ab' } }] }
    const accepted = sandbox.doPost({ postData: { contents: JSON.stringify({ action: 'lineWebhookRelay', relay_secret: 'relay-secret', payload }) } })
    expect(JSON.parse(accepted.value)).toMatchObject({ status: 'ok', group_count: 1 })
    expect(propertyWrites.some(item => item.key === 'PETCARE_LINE_GROUPS')).toBe(true)

    const rejected = sandbox.doPost({ postData: { contents: JSON.stringify({ action: 'lineWebhookRelay', relay_secret: 'wrong', payload }) } })
    expect(JSON.parse(rejected.value).message).toContain('Invalid GAS webhook relay secret')
  })

  it('requires ownership by the verified Google identity when linking a Sheet', () => {
    const { sandbox } = makeGasSandbox({ fetchImpl: url => url.includes('/drive/v3/files/')
      ? response(200, { id: 'sheet-1', name: 'Sheet', mimeType: 'application/vnd.google-apps.spreadsheet', owners: [{ emailAddress: 'other@example.com' }] })
      : response(200, {}) })
    expect(() => sandbox.getGoogleOwnedSpreadsheet('sheet-1', 'google-token', 'owner@example.com')).toThrow('must be owned')
  })

  it('provisions a Google-owned Sheet and stores the LINE mapping without requiring a LINE token', () => {
    const properties = {}
    const { sandbox, propertyWrites } = makeGasSandbox({ properties, fetchImpl: () => response(200, {}) })
    sandbox.getGoogleOwnedSpreadsheet = vi.fn(() => ({ id: 'sheet-1', name: 'PetCare' }))
    sandbox.shareWithScriptIdentity = vi.fn()
    sandbox.setupSheets = vi.fn()
    const result = sandbox.provisionUser({
      google_access_token: 'google-token',
      spreadsheet_id: 'sheet-1',
      line_user_id: 'U1234567890abcdef1234567890abcdef',
    }, { sub: 'google-1', email: 'owner@example.com' })

    expect(result).toEqual({ status: 'ok', spreadsheet_id: 'sheet-1', spreadsheet_name: 'PetCare', linked: true })
    expect(sandbox.shareWithScriptIdentity).toHaveBeenCalledWith('sheet-1', 'google-token')
    expect(sandbox.setupSheets).toHaveBeenCalledWith('sheet-1')
    expect(propertyWrites.map(item => item.key)).toEqual([
      'PETCARE_USER_SHEET_U1234567890abcdef1234567890abcdef',
      'PETCARE_USER_LINK_U1234567890abcdef1234567890abcdef',
    ])
  })

  it('shares the user-owned Sheet with the GAS effective identity before mapping can be used', () => {
    const { sandbox, calls } = makeGasSandbox({
      fetchImpl: (url, _options) => url.includes('/permissions?fields=' )
        ? response(200, { permissions: [] })
        : response(200, { id: 'permission-1' }),
    })
    sandbox.shareWithScriptIdentity('sheet-1', 'google-token')
    const shareCall = calls.find(call => call.options?.method === 'post')
    expect(JSON.parse(shareCall.options.payload)).toMatchObject({ type: 'user', role: 'writer', emailAddress: 'gas-owner@example.com' })
  })

  it('returns only delivery count and hides provider/recipient metadata', () => {
    const { sandbox } = makeGasSandbox({
      properties: { LINE_TOKEN: 'token' },
      fetchImpl: () => response(200, { message: 'provider detail' }),
    })
    const result = sandbox.sendLine('test', ['recipient'])
    expect(result).toEqual({ status: 'ok', delivery_count: 1 })
    expect(JSON.stringify(result)).not.toContain('recipient')
    expect(JSON.stringify(result)).not.toContain('provider detail')
  })

  it('allows testPush only for configured LINE admins', () => {
    const { sandbox } = makeGasSandbox({
      properties: { LINE_CHANNEL_IDS: 'channel', LINE_ADMIN_USER_IDS: 'line-admin', LINE_TOKEN: 'token', 'PETCARE_USER_SHEET_line-admin': 'sheet-admin' },
      openById: () => ({ getSheetByName: name => name === 'reminder_recipients' ? {
        getLastRow: () => 2, getLastColumn: () => 2,
        getRange: (_row, _column, rowCount) => ({ getValues: () => rowCount === 1 ? [['id', 'recipient_id']] : [['r1', 'recipient']] }),
      } : null }),
      fetchImpl: url => url.includes('/oauth2/v2.1/verify')
        ? response(200, { expires_in: 60, client_id: 'channel' })
        : url.includes('/v2/profile') ? response(200, { userId: 'line-admin' }) : response(200, {}),
    })
    const result = sandbox.doPost({ postData: { contents: JSON.stringify({ action: 'testPush', access_token: 'line-token' }) } })
    expect(JSON.parse(result.value)).toEqual({ status: 'ok', delivery_count: 1 })
  })

  it('runs scheduled reminders through every authorized user spreadsheet', () => {
    const opened = []
    const { sandbox } = makeGasSandbox({
      properties: { PETCARE_USER_SHEET_line1: 'sheet-1', PETCARE_USER_SHEET_line2: 'sheet-2' },
      openById: id => { opened.push(id); return { getSheetByName: () => null } },
      fetchImpl: () => response(200, {}),
    })
    sandbox.checkReminders()
    expect(opened).toEqual(['sheet-1', 'sheet-2'])
  })

  it('delivers scheduled reminders only to recipients mapped inside that user Sheet', () => {
    const now = new Date()
    const hour = String(now.getHours()).padStart(2, '0') + ':00'
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
    const rows = {
      med_schedules: { headers: ['id', 'pet_id', 'med_name', 'dose', 'schedule_type', 'config', 'time', 'start_date', 'active'], values: [['rem-1', 'pet-1', 'Medicine', '1', 'daily', '{}', hour, today, 'TRUE']] },
      pets: { headers: ['id', 'name'], values: [['pet-1', 'Mochi']] },
      reminder_recipients: { headers: ['id', 'reminder_id', 'recipient_id'], values: [['rr-1', 'rem-1', 'user-sheet-1']] },
    }
    const makeSheet = name => {
      const data = rows[name]
      if (!data) return null
      return { getLastRow: () => data.values.length + 1, getLastColumn: () => data.headers.length, getRange: (row, _column, rowCount) => ({ getValues: () => row === 1 ? [data.headers] : data.values.slice(0, rowCount) }) }
    }
    const deliveries = []
    const { sandbox } = makeGasSandbox({
      properties: { PETCARE_USER_SHEET_line1: 'sheet-1' },
      openById: () => ({ getSheetByName: makeSheet }),
      fetchImpl: () => response(200, {}),
    })
    sandbox.sendLine = (message, recipients) => deliveries.push({ message, recipients })
    sandbox.checkReminders()
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0].recipients).toEqual(['user-sheet-1'])
    expect(deliveries[0].message).toContain('Mochi')
  })

  it('makes provider failures observable without returning the provider body', () => {
    const { sandbox } = makeGasSandbox({
      properties: { LINE_TOKEN: 'token' },
      fetchImpl: () => response(400, { message: 'provider detail' }),
    })
    expect(() => sandbox.sendLine('test', ['recipient'])).toThrow('LINE delivery failed')
  })
})
