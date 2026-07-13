import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App.jsx'

describe('PetCare app shell', () => {
  it('renders the approved five primary navigation destinations', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'หน้าหลัก' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ติดตาม' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ไดอารี่' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'เตือน' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ตั้งค่า' })).toBeTruthy()
  })
})
