import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GoogleSheetConnection from './GoogleSheetConnection.jsx'

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
