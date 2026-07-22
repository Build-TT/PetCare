import { afterEach, describe, expect, it, vi } from 'vitest'
import { grantSheetAccess, listSheetPermissions, revokeSheetAccess } from './googleDrivePermissions.js'

afterEach(() => vi.unstubAllGlobals())

describe('Google Sheet permissions', () => {
  it('lists permissions with the authenticated Google token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ permissions: [{ id: 'p1', emailAddress: 'user@example.com', role: 'reader' }] }) })
    vi.stubGlobal('fetch', fetchMock)
    await expect(listSheetPermissions('token', 'sheet-1')).resolves.toEqual([{ id: 'p1', emailAddress: 'user@example.com', role: 'reader' }])
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token')
  })

  it('grants and revokes a valid user permission', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'p2' }) })
    vi.stubGlobal('fetch', fetchMock)
    await grantSheetAccess('token', 'sheet-1', 'New.User@Example.com', 'writer')
    await revokeSheetAccess('token', 'sheet-1', 'p2')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ type: 'user', role: 'writer', emailAddress: 'new.user@example.com' })
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE')
  })
})
