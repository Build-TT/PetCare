import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GoogleSheetLink from './GoogleSheetLink.jsx'

const { requestGoogleAccessToken, initLiff, linkGoogleSheet } = vi.hoisted(() => ({
  requestGoogleAccessToken: vi.fn(),
  initLiff: vi.fn(),
  linkGoogleSheet: vi.fn(),
}))

vi.mock('../googleAuth.js', () => ({
  isGoogleConfigured: () => true,
  loadGoogleIdentityServices: () => Promise.resolve(),
  requestGoogleAccessToken,
}))
vi.mock('./utils.js', () => ({ initLiff, linkGoogleSheet }))

describe('visible Google/LINE account linking flow', () => {
  beforeEach(() => {
    requestGoogleAccessToken.mockReset().mockResolvedValue('google-token')
    initLiff.mockReset().mockResolvedValue('line-token')
    linkGoogleSheet.mockReset().mockResolvedValue({ status: 'ok', spreadsheet_name: 'PetCare Sheet' })
  })

  it('requires consent, links with both authenticated identities, and reports success', async () => {
    const onLinked = vi.fn()
    render(<GoogleSheetLink onLinked={onLinked} />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'เชื่อมต่อ Google' }))

    await waitFor(() => expect(linkGoogleSheet).toHaveBeenCalledWith('google-token'))
    expect(initLiff).toHaveBeenCalledWith('log')
    expect(onLinked).toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toContain('PetCare Sheet')
  })

  it('supports cancel and retry after a linking error', async () => {
    linkGoogleSheet.mockRejectedValueOnce(new Error('link failed')).mockResolvedValueOnce({ status: 'ok' })
    render(<GoogleSheetLink />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'เชื่อมต่อ Google' }))
    expect((await screen.findByRole('alert')).textContent).toContain('link failed')
    fireEvent.click(screen.getByRole('button', { name: 'ลองเชื่อมต่ออีกครั้ง' }))
    await waitFor(() => expect(linkGoogleSheet).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.getByRole('checkbox')).toHaveProperty('checked', false)
  })
})
