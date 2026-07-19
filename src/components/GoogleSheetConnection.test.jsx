import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GoogleSheetConnection from './GoogleSheetConnection.jsx'

vi.mock('../googleAuth.js', () => ({
  getGoogleUserProfile: vi.fn(),
  isGoogleConfigured: () => false,
  requestGoogleAccessToken: vi.fn(),
}))

describe('Google Sheet connection control', () => {
  it('shows a clear demo-mode status when Google OAuth is not configured', () => {
    render(<GoogleSheetConnection onConnected={vi.fn()} />)
    expect(screen.getByText(/ยังไม่ได้ตั้งค่า Google OAuth/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /เชื่อมต่อ Google/ })).toHaveProperty('disabled', true)
  })
})
