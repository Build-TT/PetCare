import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ACCOUNT_STATE_CHUNK_SIZE,
  PETCARE_SHEETS,
  buildPetCareSheetTitle,
  encodeAppState,
  createOrFindPetCareSheet,
  decodeAccountStateRows,
  deserializeNormalizedState,
  encodeAccountStateRows,
  loadAppState,
  loadPetCareState,
  savePetCareState,
  serializeNormalizedState,
} from './googleSheets.js'

afterEach(() => vi.restoreAllMocks())

// account_state no longer lives in a single cell, so tests read it the way a
// reader must: collect every app_state entry and let the decoder reassemble it.
const accountStateChunks = body => body.data.filter(item => item.range.startsWith('app_state!'))
const accountStateBlob = body => JSON.parse(decodeAccountStateRows(accountStateChunks(body).flatMap(item => item.values)))

describe('Google Sheet schema', () => {
  it('uses an account-specific title and includes an app state tab', () => {
    expect(buildPetCareSheetTitle('Owner@Example.com')).toBe('PetCare - Owner@Example.com')
    expect(PETCARE_SHEETS.app_state).toEqual(['key', 'value', 'updated_at'])
    expect(PETCARE_SHEETS.pets).toContain('name')
    expect(PETCARE_SHEETS.pets).toContain('gender')
  })

  it('serializes tracker state as a single JSON value', () => {
    const encoded = encodeAppState({ tracks: [{ id: 't1' }], logs: [] })
    expect(encoded.key).toBe('ui_state')
    expect(JSON.parse(encoded.value)).toEqual({ tracks: [{ id: 't1' }], logs: [] })
    expect(encoded.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('reuses an existing account-owned PetCare Sheet without creating another one', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      json: async () => url.includes('/drive/v3/files?')
        ? { files: [{ id: 'sheet-1', name: 'PetCare - owner@example.com', webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-1/edit' }] }
        : url.includes('values:batchGet') ? { valueRanges: Object.keys(PETCARE_SHEETS).map(() => ({ values: [['id']] })) }
        : { spreadsheetId: 'sheet-1', sheets: Object.keys(PETCARE_SHEETS).map(title => ({ properties: { title, sheetId: title } })) },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createOrFindPetCareSheet('token', 'owner@example.com')

    expect(result).toMatchObject({ spreadsheetId: 'sheet-1', created: false })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[0][0]).toContain('drive/v3/files')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('uses a cached spreadsheet id before searching by title', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      json: async () => url.includes('/drive/v3/files/sheet-cached')
        ? { id: 'sheet-cached', name: 'PetCare - owner@example.com', mimeType: 'application/vnd.google-apps.spreadsheet' }
        : url.includes('values:batchGet') ? { valueRanges: Object.keys(PETCARE_SHEETS).map(() => ({ values: [['id']] })) }
        : { spreadsheetId: 'sheet-cached', sheets: Object.keys(PETCARE_SHEETS).map(title => ({ properties: { title, sheetId: title } })) },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createOrFindPetCareSheet('token', 'owner@example.com', 'sheet-cached')

    expect(result).toMatchObject({ spreadsheetId: 'sheet-cached', created: false })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[0][0]).toContain('/drive/v3/files/sheet-cached')
  })

  it('never creates a replacement Sheet when the remembered one cannot be opened', async () => {
    const fetchMock = vi.fn().mockImplementation(() => ({ ok: false, status: 503, json: async () => ({ error: { message: 'backend error' } }) }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createOrFindPetCareSheet('token', 'owner@example.com', 'sheet-remembered')).rejects.toThrow('ข้อมูลยังอยู่ครบ')
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  })

  it('finds a Sheet that was created through the production title', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      json: async () => url.includes('/drive/v3/files?')
        ? { files: [{ id: 'sheet-production', name: 'PetCare Production - owner@example.com', webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-production/edit' }] }
        : url.includes('values:batchGet') ? { valueRanges: Object.keys(PETCARE_SHEETS).map(() => ({ values: [['id']] })) }
          : { spreadsheetId: 'sheet-production', sheets: Object.keys(PETCARE_SHEETS).map(title => ({ properties: { title } })) },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createOrFindPetCareSheet('token', 'owner@example.com')

    expect(result).toMatchObject({ spreadsheetId: 'sheet-production', created: false })
    const searchUrl = decodeURIComponent(fetchMock.mock.calls[0][0])
    expect(searchUrl).toContain("name = 'PetCare - owner@example.com'")
    expect(searchUrl).toContain("name = 'PetCare Production - owner@example.com'")
  })

  it('creates a separate production Sheet when explicitly requested', async () => {
    const fetchMock = vi.fn().mockImplementation((url, options = {}) => ({
      ok: true,
      json: async () => url.includes('/spreadsheets') && options.method === 'POST'
        ? { spreadsheetId: 'sheet-production', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-production/edit', sheets: Object.keys(PETCARE_SHEETS).map(title => ({ properties: { title, sheetId: title } })) }
        : url.includes('values:batchGet') ? { valueRanges: Object.keys(PETCARE_SHEETS).map(() => ({ values: [['id']] })) }
          : { updated: true },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createOrFindPetCareSheet('token', 'owner@example.com', 'sheet-test', { createNew: true })

    expect(result).toMatchObject({ spreadsheetId: 'sheet-production', created: true, name: 'PetCare Production - owner@example.com' })
    expect(fetchMock.mock.calls[0][0]).toContain('/spreadsheets')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' })
  })

  it('does not rename an existing first sheet during partial schema recovery', async () => {
    const fetchMock = vi.fn().mockImplementation((url, _options = {}) => ({
      ok: true,
      json: async () => url.includes('values:batchGet')
        ? { valueRanges: [{ values: [['Existing Header']] }] }
        : url.includes('values:batchUpdate') ? { updated: true }
          : url.includes('/drive/v3/files/sheet-1') ? { id: 'sheet-1', name: 'PetCare - owner@example.com', mimeType: 'application/vnd.google-apps.spreadsheet' }
            : { spreadsheetId: 'sheet-1', sheets: [{ properties: { title: 'My Data', sheetId: '1' } }] },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await createOrFindPetCareSheet('token', 'owner@example.com', 'sheet-1')

    const batchUpdateBodies = fetchMock.mock.calls
      .filter(([, options]) => options?.method === 'POST' && String(options.body).includes('requests'))
      .map(([, options]) => JSON.parse(options.body))
    expect(batchUpdateBodies.flatMap(body => body.requests || []).some(request => request.updateSheetProperties)).toBe(false)
  })

  it('maps every main-app collection to its normalized entity sheets', () => {
    const state = {
      pets: [{ id: 'p1', name: 'Mochi', species: 'dog', gender: 'female', breed: 'mixed', birthdate: '2024-02-03' }],
      tracks: [{ id: 't1', pet_id: 'p1', name: 'Medicine', dose: '1 mg', schedule: '09:00', active: true }],
      symptoms: [{ id: 's1', pet_id: 'p1', label_th: 'cough', label_en: 'Cough', active: true, created_at: '2026-07-17T00:00:00.000Z', updated_at: '2026-07-17T00:00:00.000Z' }],
      logs: [{ id: 'l1', pet_id: 'p1', datetime: '2026-07-17T09:00', symptom: 'cough', diary: 'after meal', tracks: [{ id: 't1' }] }],
      activities: [{ id: 'a1', pet_id: 'p1', datetime: '2026-07-17T10:00', symptom: 'walk', duration_minutes: '20', diary: 'park' }],
      treatmentHistory: [{ id: 'h1', pet_id: 'p1', category: 'surgery', title: 'Operation', started_at: '2026-07-17T11:00', clinic: 'Clinic', note: 'rest' }],
      reminders: [{ id: 'r1', pet_id: 'p1', title: 'Checkup', detail: '2026-08-01', enabled: true }],
      lineRecipients: [{ id: 'rr1', reminder_id: '*', recipient_id: `U${'a'.repeat(32)}` }],
    }

    const rows = serializeNormalizedState(state, '2026-07-17T00:00:00.000Z')

    expect(rows.pets).toHaveLength(1)
    expect(rows.tracking_items).toHaveLength(1)
    expect(rows.tracking_versions).toHaveLength(1)
    expect(rows.symptom_catalog).toHaveLength(1)
    expect(rows.symptom_logs).toHaveLength(1)
    expect(rows.diary_logs).toHaveLength(1)
    expect(rows.activity_logs).toHaveLength(1)
    expect(rows.treatment_history).toHaveLength(1)
    expect(rows.reminders).toHaveLength(1)
    expect(rows.reminder_recipients).toHaveLength(1)
    expect(deserializeNormalizedState(rows)).toMatchObject({
      pets: [{ id: 'p1', name: 'Mochi', gender: 'female', breed: 'mixed', birthdate: '2024-02-03' }],
      tracks: [{ id: 't1', name: 'Medicine', dose: '1 mg', schedule: '09:00' }],
      symptoms: [{ id: 's1', pet_id: 'p1', label_th: 'cough', label_en: 'Cough' }],
      logs: [{ id: 'l1', symptom: 'cough', diary: 'after meal' }],
      activities: [{ id: 'a1', symptom: 'walk', duration_minutes: '20', diary: 'park' }],
      treatmentHistory: [{ id: 'h1', category: 'surgery', title: 'Operation' }],
      reminders: [{ id: 'r1', title: 'Checkup', detail: '2026-08-01', enabled: true }],
      lineRecipients: [{ id: 'rr1', reminder_id: '*', recipient_id: `U${'a'.repeat(32)}` }],
    })
  })

  it('round-trips structured reminder date and frequency fields while retaining display detail', () => {
    const state = {
      pets: [{ id: 'p1', name: 'Mochi', active: true }],
      reminders: [{
        id: 'r1', pet_id: 'p1', title: 'วัคซีน', detail: '2026-08-01 · ทุกเดือน · ยังไม่ได้ตั้งผู้รับ LINE',
        schedule_type: 'recurring',
        schedule_config: { date: '2026-08-01', frequency: 'ทุกเดือน', detail: '2026-08-01 · ทุกเดือน · ยังไม่ได้ตั้งผู้รับ LINE' },
        start_at: '2026-08-01', enabled: true,
      }],
    }

    const rows = serializeNormalizedState(state, '2026-07-17T00:00:00.000Z')
    expect(rows.reminders[0]).toEqual(expect.arrayContaining(['recurring', expect.any(String), '2026-08-01']))
    const hydrated = deserializeNormalizedState(rows)
    expect(hydrated.reminders).toEqual([
      expect.objectContaining({
        id: 'r1', title: 'วัคซีน', schedule_type: 'recurring', start_at: '2026-08-01',
        detail: '2026-08-01 · ทุกเดือน · ยังไม่ได้ตั้งผู้รับ LINE',
        schedule_config: expect.objectContaining({ date: '2026-08-01', frequency: 'ทุกเดือน' }),
      }),
    ])
  })

  it('round-trips all normalized required fields, pet-scoped symptoms, and multiple tracking versions losslessly', () => {
    const timestamp = '2026-07-17T00:00:00.000Z'
    const state = {
      pets: [
        { id: 'p1', name: 'Mochi', species: 'dog', gender: 'male', breed: 'mixed', birthdate: '2020-01-02', photo: 'photo-ref', color: 'brown', active: true, order: '2', created_at: timestamp },
        { id: 'p2', name: 'Archived', species: 'cat', gender: 'female', breed: '', birthdate: '', photo: '', color: 'black', active: false, order: '3', created_at: timestamp },
      ],
      tracks: [{
        id: 't1', pet_id: 'p1', name: 'Medicine item', active: true, created_at: timestamp, updated_at: timestamp,
        version_id: 'tv2', version_name: 'Medicine current', dose: '2 mg', schedule_type: 'daily', schedule_config: { times: ['09:00'] },
        start_at: '2026-02-01', end_at: '2026-12-31', version_active: true, version_created_at: timestamp, version_updated_at: timestamp,
        versions: [
          { id: 'tv1', tracking_item_id: 't1', pet_id: 'p1', name: 'Medicine old', dose: '1 mg', schedule_type: 'daily', schedule_config: { times: ['08:00'] }, start_at: '2026-01-01', end_at: '2026-01-31', active: false, created_at: timestamp, updated_at: timestamp },
          { id: 'tv2', tracking_item_id: 't1', pet_id: 'p1', name: 'Medicine current', dose: '2 mg', schedule_type: 'daily', schedule_config: { times: ['09:00'] }, start_at: '2026-02-01', end_at: '2026-12-31', active: true, created_at: timestamp, updated_at: timestamp },
        ],
      }],
      symptoms: [
        { id: 's-p1', pet_id: 'p1', label_th: 'ไอ', label_en: 'Cough', active: true, created_at: timestamp, updated_at: timestamp },
        { id: 's-p2', pet_id: 'p2', label_th: 'ไอ', label_en: 'Cough other pet', active: true, created_at: timestamp, updated_at: timestamp },
        { id: 's-old', pet_id: 'p1', label_th: 'เก่า', label_en: 'Archived', active: false, created_at: timestamp, updated_at: timestamp },
      ],
      logs: [{ id: 'l1', pet_id: 'p1', datetime: '2026-07-17T09:00', symptoms: ['ไอ'], symptom: 'ไอ', diary: 'note', tracks: [{ id: 't1', version_id: 'tv2' }], created_at: timestamp, updated_at: timestamp, diary_created_at: timestamp, diary_updated_at: timestamp }],
      activities: [{ id: 'a1', pet_id: 'p1', activity_type: 'walk', datetime: '2026-07-17T10:00', duration_minutes: '20', weight_kg: '6.2', diary: 'park', created_at: timestamp, updated_at: timestamp }],
      treatmentHistory: [{ id: 'h1', pet_id: 'p1', category: 'illness', title: 'Fever', started_at: '2026-07-17T11:00', ended_at: '', clinic: 'Clinic', note: 'rest', created_at: timestamp, updated_at: timestamp }],
      reminders: [{ id: 'r1', pet_id: 'p1', type: 'checkup', title: 'Checkup', schedule_type: 'once', schedule_config: { date: '2026-08-01', detail: 'clinic' }, start_at: '2026-08-01', end_at: '', enabled: true, created_at: timestamp, updated_at: timestamp }],
      lineRecipients: [{ id: 'rr1', reminder_id: '*', recipient_id: `U${'b'.repeat(32)}`, created_at: timestamp }],
    }

    const first = serializeNormalizedState(state, timestamp)
    const hydrated = deserializeNormalizedState(first)
    const second = serializeNormalizedState(hydrated, '2099-01-01T00:00:00.000Z')

    expect(second).toEqual(first)
    expect(hydrated.tracks[0]).toMatchObject({ start_at: '2026-02-01', end_at: '2026-12-31' })
    expect(hydrated.tracks[0].versions).toHaveLength(2)
    expect(hydrated.symptoms).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 's-p1', pet_id: 'p1', label_en: 'Cough', created_at: timestamp, updated_at: timestamp }),
      expect.objectContaining({ id: 's-p2', pet_id: 'p2', label_en: 'Cough other pet' }),
    ]))
  })

  it('round-trips raw English-only symptoms and distinct symptom/diary log text without merging either row', () => {
    const row = (sheet, values) => PETCARE_SHEETS[sheet].map(header => values[header] ?? '')
    const timestamp = '2026-07-17T00:00:00.000Z'
    const rawRows = {
      pets: [row('pets', { id: 'p1', name: 'Mochi', species: 'dog', active: 'TRUE', created_at: timestamp })],
      tracking_items: [],
      tracking_versions: [],
      symptom_catalog: [row('symptom_catalog', {
        id: 's-en', pet_id: 'p1', label_th: '', label_en: 'English only', active: 'TRUE', created_at: timestamp, updated_at: timestamp,
      })],
      symptom_logs: [row('symptom_logs', {
        id: 'l1', pet_id: 'p1', occurred_at: '2026-07-17T09:00', symptoms_json: '["English only"]',
        diary_text: 'symptom-sheet text', tracking_snapshot_json: '[]', created_at: timestamp, updated_at: timestamp,
      })],
      diary_logs: [row('diary_logs', {
        id: 'l1', pet_id: 'p1', occurred_at: '2026-07-17T09:00', text: 'diary-sheet text', created_at: timestamp, updated_at: timestamp,
      })],
      activity_logs: [],
      treatment_history: [],
      reminders: [],
      reminder_recipients: [],
    }

    const hydrated = deserializeNormalizedState(rawRows)
    const serialized = serializeNormalizedState(hydrated, '2099-01-01T00:00:00.000Z')

    expect(hydrated.symptoms).toEqual([
      expect.objectContaining({ id: 's-en', pet_id: 'p1', label_th: '', label_en: 'English only' }),
    ])
    expect(hydrated.logs).toEqual([
      expect.objectContaining({
        id: 'l1', diary: 'diary-sheet text', diary_text: 'symptom-sheet text',
        diary_log_text: 'diary-sheet text', diary_log_present: true,
      }),
    ])
    expect(serialized.symptom_catalog).toEqual(rawRows.symptom_catalog)
    expect(serialized.symptom_logs).toEqual(rawRows.symptom_logs)
    expect(serialized.diary_logs).toEqual(rawRows.diary_logs)
  })

  it('round-trips inactive pet rows so the UI can hide them without deleting metadata', () => {
    const rows = serializeNormalizedState({
      pets: [{ id: 'active', name: 'Active', active: true }, { id: 'deleted', name: 'Deleted', active: false }],
      tracks: [], symptoms: [], logs: [], activities: [], reminders: [],
    }, '2026-07-17T00:00:00.000Z')

    expect(deserializeNormalizedState(rows).pets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'active', active: true }),
      expect.objectContaining({ id: 'deleted', active: false }),
    ]))
  })

  it('never serializes the demo pet into normalized Google Sheet rows', () => {
    const rows = serializeNormalizedState({ pets: [{ id: 'demo', demo: true }, { id: 'real', name: 'Mochi' }], tracks: [], symptoms: [], logs: [], activities: [], reminders: [] }, '2026-07-17T00:00:00.000Z')
    expect(rows.pets.map(row => row[0])).toEqual(['real'])
  })

  it('writes normalized rows and the backward-compatible app_state in one authenticated batch', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      json: async () => url.includes('values:batchGet')
        ? { valueRanges: Object.keys({ pets: 1, tracking_items: 1, tracking_versions: 1, symptom_catalog: 1, symptom_logs: 1, diary_logs: 1, activity_logs: 1, treatment_history: 1, reminders: 1, reminder_recipients: 1 }).map(() => ({ values: [] })) }
        : { updated: true },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await savePetCareState('secret-token', 'sheet-1', {
      pets: [{ id: 'p1', name: 'Mochi' }], tracks: [], symptoms: [], logs: [], activities: [], reminders: [], activePetId: 'p1',
    })

    const update = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
    const body = JSON.parse(update[1].body)
    expect(update[0]).toContain('/values:batchUpdate')
    expect(update[1].headers.Authorization).toBe('Bearer secret-token')
    expect(body.data.map(item => item.range)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^pets!A2:A/),
      expect.stringMatching(/^tracking_items!A2:A/),
      expect.stringMatching(/^tracking_versions!A2:A/),
      expect.stringMatching(/^symptom_catalog!A2:A/),
      expect.stringMatching(/^symptom_logs!A2:A/),
      expect.stringMatching(/^diary_logs!A2:A/),
      expect.stringMatching(/^activity_logs!A2:A/),
      expect.stringMatching(/^treatment_history!A2:A/),
      expect.stringMatching(/^reminders!A2:A/),
      expect.stringMatching(/^reminder_recipients!A2:A/),
      'app_state!A2:C2',
    ]))
    const legacyState = JSON.parse(body.data.find(item => item.range === 'app_state!A2:C2').values[0][1])
    expect(legacyState).toEqual({ __normalized_schema_version: 1, activePetId: 'p1' })
    expect(legacyState).not.toHaveProperty('pets')
    expect(legacyState).not.toHaveProperty('tracks')
  })

  it('compacts deleted entities and clears stale owned cells without touching headers', async () => {
    const valueRanges = Array.from({ length: 10 }, () => ({ values: [['old-1'], ['old-2']] }))
    const fetchMock = vi.fn().mockImplementation((url) => ({ ok: true, json: async () => url.includes('values:batchGet') ? { valueRanges } : {} }))
    vi.stubGlobal('fetch', fetchMock)

    await savePetCareState('token', 'sheet-1', { pets: [], tracks: [], symptoms: [], logs: [], activities: [], reminders: [] }, {
      pets: { 'old-1': '', 'old-2': '' }, tracks: { 'old-1': '', 'old-2': '' }, symptoms: { 'old-1': '', 'old-2': '' },
      logs: { 'old-1': '', 'old-2': '' }, activities: { 'old-1': '', 'old-2': '' }, treatmentHistory: { 'old-1': '', 'old-2': '' },
      reminders: { 'old-1': '', 'old-2': '' }, lineRecipients: { 'old-1': '', 'old-2': '' },
    })

    const update = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST' && String(options.body).includes('valueInputOption'))
    const body = JSON.parse(update[1].body)
    const petsWrite = body.data.find(item => item.range.startsWith('pets!A2:A'))
    expect(petsWrite.values).toHaveLength(1)
    expect(petsWrite.values.every(row => row.every(value => value === ''))).toBe(true)
    expect(petsWrite.range).not.toContain('A1')
    const clear = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST' && String(options.body).includes('"ranges"'))
    expect(clear[0]).toContain('/values:batchClear')
    expect(JSON.parse(clear[1].body).ranges).toContain('pets!A2:A3')
  })

  it('maps reordered headers and preserves user-created columns during upsert', async () => {
    const petHeaders = ['custom_note', ...[...PETCARE_SHEETS.pets].reverse()]
    const oldPet = petHeaders.map(header => header === 'custom_note' ? 'keep me' : header === 'id' ? 'old-pet' : '')
    const normalizedNames = ['pets', 'tracking_items', 'tracking_versions', 'symptom_catalog', 'symptom_logs', 'diary_logs', 'activity_logs', 'treatment_history', 'reminders', 'reminder_recipients']
    const valueRanges = normalizedNames.map(name => ({
      values: name === 'pets' ? [petHeaders, oldPet] : [PETCARE_SHEETS[name]],
    }))
    const fetchMock = vi.fn().mockImplementation((url) => ({ ok: true, json: async () => url.includes('values:batchGet') ? { valueRanges } : {} }))
    vi.stubGlobal('fetch', fetchMock)

    await savePetCareState('token', 'sheet-1', {
      pets: [{ id: 'new-pet', name: 'New pet', species: 'dog' }], tracks: [], symptoms: [], logs: [], activities: [], reminders: [],
    }, { pets: { 'old-pet': '' } })

    const body = JSON.parse(fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
    const customColumn = String.fromCharCode(65 + petHeaders.indexOf('custom_note'))
    const idColumn = String.fromCharCode(65 + petHeaders.indexOf('id'))
    const nameColumn = String.fromCharCode(65 + petHeaders.indexOf('name'))
    expect(body.data.some(item => item.range.startsWith(`pets!${customColumn}2:`))).toBe(false)
    expect(body.data.find(item => item.range.startsWith(`pets!${idColumn}2:`)).values.flat()).toEqual(['new-pet'])
    expect(body.data.find(item => item.range.startsWith(`pets!${nameColumn}2:`)).values.flat()).toEqual(['New pet'])
  })

  it('preserves inactive rows and tracking version history while upserting current entities', async () => {
    const normalizedNames = ['pets', 'tracking_items', 'tracking_versions', 'symptom_catalog', 'symptom_logs', 'diary_logs', 'activity_logs', 'treatment_history', 'reminders', 'reminder_recipients']
    const objectRow = (name, object) => PETCARE_SHEETS[name].map(header => object[header] ?? '')
    const valueRanges = normalizedNames.map(name => ({
      values: [PETCARE_SHEETS[name], ...(name === 'pets'
        ? [objectRow(name, { id: 'inactive-pet', name: 'Archived', active: 'FALSE' })]
        : name === 'tracking_versions'
          ? [objectRow(name, { id: 'version-old', tracking_item_id: 'track-1', name: 'Old dose', active: 'FALSE' })]
          : [])],
    }))
    const fetchMock = vi.fn().mockImplementation((url) => ({ ok: true, json: async () => url.includes('values:batchGet') ? { valueRanges } : {} }))
    vi.stubGlobal('fetch', fetchMock)

    await savePetCareState('token', 'sheet-1', {
      pets: [{ id: 'active-pet', name: 'Current', active: true }],
      tracks: [{ id: 'track-1', version_id: 'version-current', name: 'Current dose', active: true }],
      symptoms: [], logs: [], activities: [], reminders: [],
    })

    const body = JSON.parse(fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
    const valuesFor = (sheet, header) => {
      const column = String.fromCharCode(65 + PETCARE_SHEETS[sheet].indexOf(header))
      return body.data.find(item => item.range.startsWith(`${sheet}!${column}2:`)).values.flat()
    }
    expect(valuesFor('pets', 'id')).toEqual(['inactive-pet', 'active-pet'])
    expect(valuesFor('pets', 'active')).toEqual(['FALSE', 'TRUE'])
    expect(valuesFor('tracking_versions', 'id')).toEqual(['version-old', 'version-current'])
    expect(valuesFor('tracking_versions', 'tracking_item_id')).toEqual(['track-1', 'track-1'])
  })

  it('upserts and deletes every UI-owned normalized entity while retaining all version rows', async () => {
    const timestamp = '2026-07-17T00:00:00.000Z'
    const names = ['pets', 'tracking_items', 'tracking_versions', 'symptom_catalog', 'symptom_logs', 'diary_logs', 'activity_logs', 'treatment_history', 'reminders', 'reminder_recipients']
    const row = (name, values) => PETCARE_SHEETS[name].map(header => values[header] ?? '')
    const existing = {
      pets: [row('pets', { id: 'p1', name: 'Old pet', active: 'TRUE' }), row('pets', { id: 'p-delete', active: 'TRUE' })],
      tracking_items: [row('tracking_items', { id: 't1', name: 'Old item', active: 'TRUE' }), row('tracking_items', { id: 't-delete', active: 'TRUE' })],
      tracking_versions: [
        row('tracking_versions', { id: 'tv-old', tracking_item_id: 't1', name: 'History', active: 'FALSE' }),
        row('tracking_versions', { id: 'tv1', tracking_item_id: 't1', name: 'Old current', active: 'TRUE' }),
        row('tracking_versions', { id: 'tv-orphan', tracking_item_id: 't-delete', name: 'Retained history', active: 'FALSE' }),
      ],
      symptom_catalog: [row('symptom_catalog', { id: 's1', pet_id: 'p1', label_th: 'old', active: 'TRUE' }), row('symptom_catalog', { id: 's-delete', active: 'TRUE' })],
      symptom_logs: [row('symptom_logs', { id: 'l1', pet_id: 'p1' }), row('symptom_logs', { id: 'l-delete' })],
      diary_logs: [row('diary_logs', { id: 'l1', pet_id: 'p1' }), row('diary_logs', { id: 'l-delete' })],
      activity_logs: [row('activity_logs', { id: 'a1', pet_id: 'p1' }), row('activity_logs', { id: 'a-delete' })],
      treatment_history: [row('treatment_history', { id: 'h1', pet_id: 'p1' }), row('treatment_history', { id: 'h-delete' })],
      reminders: [row('reminders', { id: 'r1', pet_id: 'p1', active: 'TRUE' }), row('reminders', { id: 'r-delete', active: 'TRUE' })],
      reminder_recipients: [row('reminder_recipients', { id: 'rr1', reminder_id: '*', recipient_id: `U${'c'.repeat(32)}` }), row('reminder_recipients', { id: 'rr-delete' })],
    }
    const valueRanges = names.map(name => ({ values: [PETCARE_SHEETS[name], ...existing[name]] }))
    const fetchMock = vi.fn().mockImplementation((url) => ({ ok: true, json: async () => url.includes('values:batchGet') ? { valueRanges } : {} }))
    vi.stubGlobal('fetch', fetchMock)

    const baseline = {
      pets: { p1: '', 'p-delete': '' }, tracks: { t1: '', 't-delete': '' }, symptoms: { s1: '', 's-delete': '' },
      logs: { l1: '', 'l-delete': '' }, activities: { a1: '', 'a-delete': '' }, treatmentHistory: { h1: '', 'h-delete': '' },
      reminders: { r1: '', 'r-delete': '' }, lineRecipients: { rr1: '', 'rr-delete': '' },
    }
    await savePetCareState('token', 'sheet-1', {
      pets: [{ id: 'p1', name: 'Updated pet', active: true, created_at: timestamp }],
      tracks: [{ id: 't1', name: 'Updated item', active: true, version_id: 'tv1', version_name: 'Updated current', versions: [{ id: 'tv1', tracking_item_id: 't1', name: 'Updated current', active: true }] }],
      symptoms: [{ id: 's1', pet_id: 'p1', label_th: 'updated', active: true }],
      logs: [{ id: 'l1', pet_id: 'p1', datetime: '2026-07-17T09:00', symptom: 'updated', diary: 'updated diary', tracks: [] }],
      activities: [{ id: 'a1', pet_id: 'p1', datetime: '2026-07-17T10:00', symptom: 'walk', diary: 'updated activity' }],
      treatmentHistory: [{ id: 'h1', pet_id: 'p1', category: 'illness', title: 'Updated history' }],
      reminders: [{ id: 'r1', pet_id: 'p1', title: 'Updated reminder', enabled: true }],
      lineRecipients: [{ id: 'rr1', reminder_id: '*', recipient_id: `U${'d'.repeat(32)}` }],
    }, baseline)

    const body = JSON.parse(fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
    const valuesFor = (sheet, header) => {
      const index = PETCARE_SHEETS[sheet].indexOf(header)
      const column = index < 26 ? String.fromCharCode(65 + index) : `A${String.fromCharCode(65 + index - 26)}`
      return body.data.find(item => item.range.startsWith(`${sheet}!${column}2:`)).values.flat()
    }
    for (const [sheet, kept, deleted] of [
      ['pets', 'p1', 'p-delete'], ['tracking_items', 't1', 't-delete'], ['symptom_catalog', 's1', 's-delete'],
      ['symptom_logs', 'l1', 'l-delete'], ['diary_logs', 'l1', 'l-delete'], ['activity_logs', 'a1', 'a-delete'], ['treatment_history', 'h1', 'h-delete'], ['reminders', 'r1', 'r-delete'], ['reminder_recipients', 'rr1', 'rr-delete'],
    ]) {
      expect(valuesFor(sheet, 'id')).toContain(kept)
      expect(valuesFor(sheet, 'id')).not.toContain(deleted)
    }
    expect(valuesFor('tracking_versions', 'id')).toEqual(['tv-old', 'tv1', 'tv-orphan'])
    expect(valuesFor('pets', 'name')).toContain('Updated pet')
    expect(valuesFor('symptom_catalog', 'label_th')).toContain('updated')
    expect(valuesFor('reminders', 'title')).toContain('Updated reminder')
  })

  it('keeps rows another user of a shared Sheet added since this device last synced', async () => {
    const names = ['pets', 'tracking_items', 'tracking_versions', 'symptom_catalog', 'symptom_logs', 'diary_logs', 'activity_logs', 'treatment_history', 'reminders', 'reminder_recipients']
    const row = (name, values) => PETCARE_SHEETS[name].map(header => values[header] ?? '')
    const existing = Object.fromEntries(names.map(name => [name, []]))
    existing.symptom_logs = [row('symptom_logs', { id: 'mine', pet_id: 'p1' }), row('symptom_logs', { id: 'theirs', pet_id: 'p1' })]
    existing.activity_logs = [row('activity_logs', { id: 'their-activity', pet_id: 'p1' })]
    const valueRanges = names.map(name => ({ values: [PETCARE_SHEETS[name], ...existing[name]] }))
    const fetchMock = vi.fn().mockImplementation((url) => ({ ok: true, json: async () => url.includes('values:batchGet') ? { valueRanges } : {} }))
    vi.stubGlobal('fetch', fetchMock)

    // This device only ever saw "mine"; "theirs" was written by the other user.
    await savePetCareState('token', 'sheet-1', {
      pets: [], tracks: [], symptoms: [], activities: [], reminders: [], treatmentHistory: [], lineRecipients: [],
      logs: [{ id: 'mine', pet_id: 'p1', datetime: '2026-08-01T09:00', symptom: 'ซึม', tracks: [] }],
    }, { logs: { mine: '' }, activities: {}, pets: {}, tracks: {}, symptoms: {}, treatmentHistory: {}, reminders: {}, lineRecipients: {} })

    const body = JSON.parse(fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
    const idsFor = sheet => body.data.find(item => item.range.startsWith(`${sheet}!A2:`)).values.flat()
    expect(idsFor('symptom_logs')).toEqual(expect.arrayContaining(['mine', 'theirs']))
    expect(idsFor('activity_logs')).toContain('their-activity')
    const sharedBlob = accountStateBlob(body)
    expect(sharedBlob.logs.map(item => item.id)).toEqual(expect.arrayContaining(['mine', 'theirs']))
    expect(sharedBlob.activities.map(item => item.id)).toContain('their-activity')
  })

  it('never deletes unknown rows when this device has no baseline yet', async () => {
    const names = ['pets', 'tracking_items', 'tracking_versions', 'symptom_catalog', 'symptom_logs', 'diary_logs', 'activity_logs', 'treatment_history', 'reminders', 'reminder_recipients']
    const row = (name, values) => PETCARE_SHEETS[name].map(header => values[header] ?? '')
    const valueRanges = names.map(name => ({ values: [PETCARE_SHEETS[name], ...(name === 'symptom_logs' ? [row('symptom_logs', { id: 'pre-existing', pet_id: 'p1' })] : [])] }))
    const fetchMock = vi.fn().mockImplementation((url) => ({ ok: true, json: async () => url.includes('values:batchGet') ? { valueRanges } : {} }))
    vi.stubGlobal('fetch', fetchMock)

    await savePetCareState('token', 'sheet-1', { pets: [], tracks: [], symptoms: [], logs: [], activities: [], reminders: [] })

    const body = JSON.parse(fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
    expect(body.data.find(item => item.range.startsWith('symptom_logs!A2:')).values.flat()).toContain('pre-existing')
  })

  it('migrates legacy app_state when normalized sheets are still empty', async () => {
    const legacy = { pets: [{ id: 'legacy-pet', name: 'Legacy' }], tracks: [{ id: 'legacy-track' }], logs: [], activities: [], reminders: [], symptoms: [] }
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      json: async () => url.includes('/values/app_state')
        ? { values: [['ui_state', JSON.stringify(legacy), '2026-07-17']] }
        : { valueRanges: Array.from({ length: 10 }, () => ({ values: [] })) },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadPetCareState('token', 'sheet-1')).resolves.toMatchObject(legacy)
    expect(fetchMock.mock.calls.every(([, options]) => options.headers.Authorization === 'Bearer token')).toBe(true)
  })

  it('treats empty normalized sheets as authoritative after migration', async () => {
    const legacy = { __normalized_schema_version: 1, pets: [{ id: 'deleted-pet' }], tracks: [{ id: 'deleted-track' }], logs: [], activities: [], reminders: [], symptoms: [] }
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      json: async () => url.includes('/values/app_state')
        ? { values: [['ui_state', JSON.stringify(legacy), '2026-07-17']] }
        : { valueRanges: Array.from({ length: 10 }, () => ({ values: [] })) },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadPetCareState('token', 'sheet-1')).resolves.toMatchObject({ pets: [], tracks: [] })
  })
})

describe('chunked account_state', () => {
  const timestamp = '2026-08-03T00:00:00.000Z'
  const emptyValueRanges = () => ({ valueRanges: Array.from({ length: 10 }, () => ({ values: [] })) })

  it('splits a huge JSON blob into ordered chunk rows that reassemble byte-for-byte', () => {
    const json = JSON.stringify({ note: 'ก'.repeat(120000) })
    expect(json.length).toBeGreaterThan(100000)

    const rows = encodeAccountStateRows(json, timestamp)

    expect(ACCOUNT_STATE_CHUNK_SIZE).toBe(45000)
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rows.map(row => row[0])).toEqual(['account_state', ...rows.slice(1).map((_, index) => `account_state#${index + 2}`)])
    expect(rows.every(row => row[1].length <= 45000)).toBe(true)
    expect(rows.every(row => row[2] === timestamp)).toBe(true)
    expect(decodeAccountStateRows(rows)).toBe(json)
  })

  it('reassembles chunks in numeric order regardless of row order and ignores other keys', () => {
    const json = JSON.stringify({ note: 'x'.repeat(500000) })
    const rows = encodeAccountStateRows(json, timestamp)
    expect(rows.length).toBeGreaterThan(10)

    const shuffled = [['ui_state', '{"__normalized_schema_version":1}', timestamp], ...[...rows].reverse()]

    expect(decodeAccountStateRows(shuffled)).toBe(json)
  })

  it('treats a legacy single account_state row as one chunk and unknown sheets as empty', () => {
    expect(decodeAccountStateRows([['account_state', '{"pets":[]}', timestamp]])).toBe('{"pets":[]}')
    expect(decodeAccountStateRows([['ui_state', '{"pets":[]}', timestamp]])).toBe('')
    expect(decodeAccountStateRows([])).toBe('')
    expect(decodeAccountStateRows(undefined)).toBe('')
  })

  it('writes one batchUpdate entry per chunk row and clears the rows after the last chunk', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      json: async () => url.includes('values:batchGet') ? emptyValueRanges() : { updated: true },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const logs = Array.from({ length: 20 }, (_, index) => ({
      id: `l${index}`, pet_id: 'p1', datetime: '2026-08-01T09:00', symptom: 'ซึม', diary: 'ก'.repeat(6000), tracks: [],
    }))

    await savePetCareState('token', 'sheet-1', {
      pets: [{ id: 'p1', name: 'Mochi' }], tracks: [], symptoms: [], activities: [], reminders: [], logs, activePetId: 'p1',
    })

    const body = JSON.parse(fetchMock.mock.calls.find(([, options]) => options?.method === 'POST' && String(options.body).includes('valueInputOption'))[1].body)
    const chunks = accountStateChunks(body).filter(item => item.range !== 'app_state!A2:C2')
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    expect(chunks.map(item => item.range)).toEqual(chunks.map((_, index) => `app_state!A${index + 3}:C${index + 3}`))
    expect(chunks.map(item => item.values[0][0])).toEqual(['account_state', ...chunks.slice(1).map((_, index) => `account_state#${index + 2}`)])
    expect(chunks.every(item => item.values[0][1].length <= 45000)).toBe(true)
    expect(body.data.some(item => item.range === 'app_state!A2:C2')).toBe(true)
    const blob = accountStateBlob(body)
    expect(blob.activePetId).toBe('p1')
    expect(blob.logs).toHaveLength(20)
    expect(blob.pets.map(pet => pet.id)).toEqual(['p1'])

    const clear = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST' && String(options.body).includes('"ranges"'))
    expect(clear[0]).toContain('/values:batchClear')
    expect(JSON.parse(clear[1].body).ranges).toContain(`app_state!A${chunks.length + 3}:C42`)
  })

  it('clears stale chunk rows even when a small state needs a single chunk', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => ({
      ok: true,
      json: async () => url.includes('values:batchGet') ? emptyValueRanges() : { updated: true },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await savePetCareState('token', 'sheet-1', { pets: [{ id: 'p1', name: 'Mochi' }], tracks: [], symptoms: [], logs: [], activities: [], reminders: [] })

    const body = JSON.parse(fetchMock.mock.calls.find(([, options]) => options?.method === 'POST' && String(options.body).includes('valueInputOption'))[1].body)
    expect(accountStateChunks(body).map(item => item.range)).toEqual(['app_state!A2:C2', 'app_state!A3:C3'])
    const clearCalls = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST' && String(options.body).includes('"ranges"'))
    expect(clearCalls).toHaveLength(1)
    expect(JSON.parse(clearCalls[0][1].body).ranges).toContain('app_state!A4:C42')
  })

  it('loads a chunked account_state sheet, a legacy single-row sheet, and the ui_state fallback', async () => {
    const state = { pets: [{ id: 'p1', name: 'Mochi', photo: 'p'.repeat(60000) }], logs: [] }
    const chunked = encodeAccountStateRows(JSON.stringify(state), timestamp)
    expect(chunked.length).toBeGreaterThan(1)
    const respondWith = rows => vi.stubGlobal('fetch', vi.fn().mockImplementation(() => ({ ok: true, json: async () => ({ values: rows }) })))

    respondWith([['ui_state', '{"__normalized_schema_version":1}', timestamp], ...[...chunked].reverse()])
    await expect(loadAppState('token', 'sheet-1')).resolves.toEqual(state)

    respondWith([['ui_state', '{"legacy":true}', timestamp], ['account_state', '{"pets":[{"id":"p1"}]}', timestamp]])
    await expect(loadAppState('token', 'sheet-1')).resolves.toEqual({ pets: [{ id: 'p1' }] })

    respondWith([['ui_state', '{"legacy":true}', timestamp]])
    await expect(loadAppState('token', 'sheet-1')).resolves.toEqual({ legacy: true })

    respondWith([['account_state', 'not json', timestamp]])
    await expect(loadAppState('token', 'sheet-1')).resolves.toBeNull()

    respondWith([])
    await expect(loadAppState('token', 'sheet-1')).resolves.toBeNull()
  })

  it('blanks only an oversized photo cell so the rest of the pet row still syncs', () => {
    const oversized = 'd'.repeat(49001)
    const state = {
      pets: [
        { id: 'p1', name: 'Mochi', color: 'brown', photo: oversized, active: true },
        { id: 'p2', name: 'Kiwi', color: 'white', photo: 'data:image/jpeg;base64,small', active: true },
        { id: 'p3', name: 'Edge', photo: 'e'.repeat(49000), active: true },
      ],
      tracks: [], symptoms: [], logs: [], activities: [], reminders: [],
    }

    const rows = serializeNormalizedState(state, timestamp)

    const cell = (index, header) => rows.pets[index][PETCARE_SHEETS.pets.indexOf(header)]
    expect(cell(0, 'photo')).toBe('')
    expect(cell(0, 'name')).toBe('Mochi')
    expect(cell(0, 'color')).toBe('brown')
    expect(cell(0, 'active')).toBe('TRUE')
    expect(cell(1, 'photo')).toBe('data:image/jpeg;base64,small')
    expect(cell(2, 'photo')).toHaveLength(49000)
    expect(state.pets[0].photo).toBe(oversized)
  })
})
