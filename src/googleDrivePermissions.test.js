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
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ permissions: [] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'p2' }) })
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    await grantSheetAccess('token', 'sheet-1', 'New.User@Example.com', 'writer')
    await revokeSheetAccess('token', 'sheet-1', 'p2')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ type: 'user', role: 'writer', emailAddress: 'new.user@example.com' })
    expect(fetchMock.mock.calls[2][1].method).toBe('DELETE')
  })

  it('does not duplicate an existing permission and updates its role idempotently', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ permissions: [{ id: 'p1', type: 'user', emailAddress: 'user@example.com', role: 'reader' }] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'p1', role: 'writer' }) })
    vi.stubGlobal('fetch', fetchMock)
    await grantSheetAccess('token', 'sheet-1', 'USER@example.com', 'writer')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ role: 'writer' })
  })
})
