import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GoogleSheetConnection from './GoogleSheetConnection.jsx'

const { createOrFindPetCareSheet } = vi.hoisted(() => ({ createOrFindPetCareSheet: vi.fn() }))

vi.mock('../googleSheets.js', () => ({ createOrFindPetCareSheet }))

vi.mock('../googleAuth.js', () => ({
  getGoogleUserProfile: vi.fn(),
  isGoogleConfigured: () => true,
  requestGoogleAccessToken: vi.fn(),
}))

describe('Google Sheet connection control', () => {
  it('requires explicit consent before starting Google authorization', () => {
    render(<GoogleSheetConnection onConnected={vi.fn()} />)

    expect(screen.getByText(/อนุญาตให้ PetCare สร้างและบันทึกข้อมูล/)).toBeTruthy()
    expect(screen.getByRole('checkbox')).toHaveProperty('checked', false)
    expect(screen.getByRole('button', { name: /เชื่อมต่อ Google/ })).toHaveProperty('disabled', true)
  })

  it('shows hydrate/connection failures instead of silently rolling back', () => {
    render(<GoogleSheetConnection onConnected={vi.fn()} externalError="โหลดข้อมูลจาก Google Sheet ไม่สำเร็จ" />)
    expect(screen.getByRole('alert').textContent).toContain('โหลดข้อมูลจาก Google Sheet ไม่สำเร็จ')
  })
})
describe('Google Sheet production replacement', () => {
  it('creates a new Production Sheet from an existing connection without requiring consent again', async () => {
    createOrFindPetCareSheet.mockResolvedValue({ spreadsheetId: 'production-sheet', spreadsheetUrl: 'https://sheet.test/production', name: 'PetCare Production', created: true })
    const onConnected = vi.fn().mockResolvedValue(undefined)
    render(<GoogleSheetConnection onConnected={onConnected} connection={{ email: 'owner@example.com', spreadsheetId: 'old-sheet', spreadsheetUrl: 'https://sheet.test/old', accessToken: 'existing-token' }} />)

    fireEvent.click(screen.getByRole('button', { name: /เริ่มใช้ Sheet ใหม่สำหรับ Production/ }))

    await waitFor(() => expect(createOrFindPetCareSheet).toHaveBeenCalledWith('existing-token', 'owner@example.com', '', { createNew: true }))
    expect(onConnected).toHaveBeenCalledWith(expect.objectContaining({ spreadsheetId: 'production-sheet', created: true }))
  })
})
