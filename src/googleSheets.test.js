import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PETCARE_SHEETS,
  buildPetCareSheetTitle,
  encodeAppState,
  createOrFindPetCareSheet,
} from './googleSheets.js'

afterEach(() => vi.restoreAllMocks())

describe('Google Sheet schema', () => {
  it('uses an account-specific title and includes an app state tab', () => {
    expect(buildPetCareSheetTitle('Owner@Example.com')).toBe('PetCare - Owner@Example.com')
    expect(PETCARE_SHEETS.app_state).toEqual(['key', 'value', 'updated_at'])
    expect(PETCARE_SHEETS.pets).toContain('name')
  })

  it('serializes tracker state as a single JSON value', () => {
    const encoded = encodeAppState({ tracks: [{ id: 't1' }], logs: [] })
    expect(encoded.key).toBe('ui_state')
    expect(JSON.parse(encoded.value)).toEqual({ tracks: [{ id: 't1' }], logs: [] })
    expect(encoded.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('reuses an existing account-owned PetCare Sheet without creating another one', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [{ id: 'sheet-1', name: 'PetCare - owner@example.com', webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-1/edit' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await createOrFindPetCareSheet('token', 'owner@example.com')

    expect(result).toMatchObject({ spreadsheetId: 'sheet-1', created: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('drive/v3/files')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer token' },
    })
  })
})
