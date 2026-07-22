import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GoogleSheetMembers from './GoogleSheetMembers.jsx'

const drive = vi.hoisted(() => ({
  grantSheetAccess: vi.fn(), listSheetPermissions: vi.fn(), revokeSheetAccess: vi.fn(),
}))
const accounts = vi.hoisted(() => ({
  inviteAccountUser: vi.fn(), listAccountUsers: vi.fn(), revokeAccountUser: vi.fn(), cancelAccountInvite: vi.fn(), removeAccountAccess: vi.fn(),
}))
vi.mock('../googleDrivePermissions.js', () => drive)
vi.mock('../accountAuth.js', () => accounts)

describe('Google Sheet member management', () => {
  it('uses one idempotent action for Drive access and PetCare account invitation', async () => {
    drive.listSheetPermissions.mockResolvedValue([])
    drive.grantSheetAccess.mockResolvedValue({ id: 'permission-1' })
    accounts.listAccountUsers.mockResolvedValue({ members: [] })
    accounts.removeAccountAccess.mockResolvedValue({ status: 'ok', already_removed: true })
    accounts.inviteAccountUser.mockResolvedValue({ invite_code: 'CODE123', email_sent: true })
    render(<GoogleSheetMembers connection={{ accessToken: 'google-token', spreadsheetId: 'sheet-1' }} />)

    const input = screen.getByPlaceholderText('user@example.com')
    fireEvent.change(input, { target: { value: 'user@example.com' } })
    fireEvent.submit(input.closest('form'))

    await waitFor(() => expect(accounts.inviteAccountUser).toHaveBeenCalledWith('google-token', 'sheet-1', 'user@example.com', 'reader'))
    expect(drive.grantSheetAccess).toHaveBeenCalledWith('google-token', 'sheet-1', 'user@example.com', 'reader')
    expect(screen.getAllByRole('status').some(node => node.textContent.includes('CODE123'))).toBe(true)
  })

  it('confirms that an existing account was linked and emailed', async () => {
    drive.listSheetPermissions.mockResolvedValue([])
    drive.grantSheetAccess.mockResolvedValue({ id: 'permission-1' })
    accounts.listAccountUsers.mockResolvedValue({ members: [] })
    accounts.inviteAccountUser.mockResolvedValue({ existing_account: true, email_sent: true, role: 'reader' })
    render(<GoogleSheetMembers connection={{ accessToken: 'google-token', spreadsheetId: 'sheet-1' }} />)

    const input = screen.getByPlaceholderText('user@example.com')
    fireEvent.change(input, { target: { value: 'user@example.com' } })
    fireEvent.submit(input.closest('form'))

    await waitFor(() => expect(screen.getByText('ผูกบัญชี PetCare กับ Sheet และส่งอีเมลแจ้งสิทธิ์แล้ว (reader)')).toBeTruthy())
    expect(screen.queryByText(/Invite code:/)).toBeNull()
  })

  it('explains an existing-account email failure without referring to an invite code', async () => {
    drive.listSheetPermissions.mockResolvedValue([])
    drive.grantSheetAccess.mockResolvedValue({ id: 'permission-1' })
    accounts.listAccountUsers.mockResolvedValue({ members: [] })
    accounts.inviteAccountUser.mockResolvedValue({ existing_account: true, email_sent: false, role: 'writer', email_error: 'mail quota exceeded' })
    render(<GoogleSheetMembers connection={{ accessToken: 'google-token', spreadsheetId: 'sheet-1' }} />)

    const input = screen.getByPlaceholderText('user@example.com')
    fireEvent.change(input, { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'writer' } })
    fireEvent.submit(input.closest('form'))

    await waitFor(() => expect(screen.getByText('ผูกบัญชี PetCare กับ Sheet แล้ว แต่ส่งอีเมลไม่สำเร็จ กรุณาแจ้งผู้ใช้ให้เข้าสู่ระบบด้วย Google อีเมลนี้ (writer)')).toBeTruthy())
    expect(document.body.textContent).not.toContain('Invite code')
  })

  it('treats a stale Google permission as already revoked and removes it locally', async () => {
    drive.listSheetPermissions
      .mockResolvedValueOnce([{ id: 'permission-1', type: 'user', emailAddress: 'user@example.com', role: 'reader' }])
      .mockResolvedValue([])
    accounts.listAccountUsers.mockResolvedValue({ members: [] })
    const error = Object.assign(new Error('Permission not found'), { status: 404 })
    drive.revokeSheetAccess.mockRejectedValue(error)
    vi.stubGlobal('confirm', () => true)
    render(<GoogleSheetMembers connection={{ accessToken: 'google-token', spreadsheetId: 'sheet-1' }} />)
    await waitFor(() => expect(screen.getByText('user@example.com')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /ลบสิทธิ์/ }))
    await waitFor(() => expect(screen.queryByText('user@example.com')).toBeNull())
    expect(accounts.removeAccountAccess).toHaveBeenCalledWith('google-token', 'sheet-1', 'user@example.com')
  })

  it('surfaces a PetCare removal failure instead of claiming both systems were removed', async () => {
    drive.listSheetPermissions.mockResolvedValue([{ id: 'permission-1', type: 'user', emailAddress: 'user@example.com', role: 'reader' }])
    accounts.listAccountUsers.mockRejectedValue(new Error('account list unavailable'))
    accounts.removeAccountAccess.mockRejectedValue(new Error('PetCare backend unavailable'))
    drive.revokeSheetAccess.mockResolvedValue({})
    vi.stubGlobal('confirm', () => true)
    render(<GoogleSheetMembers connection={{ accessToken: 'google-token', spreadsheetId: 'sheet-1' }} />)
    await waitFor(() => expect(screen.getByText('user@example.com')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'ลบสิทธิ์' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('PetCare backend unavailable'))
    expect(screen.queryByText('ลบสิทธิ์ Google Drive และ PetCare แล้ว')).toBeNull()
  })
})
