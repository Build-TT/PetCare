import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App.jsx'

describe('PetCare app shell', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the approved five primary navigation destinations', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'หน้าหลัก' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ติดตาม' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ไดอารี่' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'เตือน' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ตั้งค่า' })).toBeTruthy()
  })

  it('requires Google Drive connection on first use', () => {
    render(<App />)

    expect(screen.getByRole('dialog', { name: 'เชื่อม Google Drive ก่อนเริ่มใช้งาน' })).toBeTruthy()
    expect(screen.getByText('ข้อมูลอยู่ใน Google Drive ของคุณ')).toBeTruthy()
  })

  it('remembers a previously connected Google Sheet', () => {
    window.localStorage.setItem('petcare.google-sheet.v1', JSON.stringify({
      spreadsheetId: 'sheet-123',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-123/edit',
      email: 'owner@example.com',
    }))

    render(<App />)

    expect(screen.queryByRole('dialog', { name: 'เชื่อม Google Drive ก่อนเริ่มใช้งาน' })).toBeNull()
  })
})
