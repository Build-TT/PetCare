import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchSheet, sendToGAS, initLiff, nowLocalISO } = vi.hoisted(() => ({
  fetchSheet: vi.fn(), sendToGAS: vi.fn(), initLiff: vi.fn(), nowLocalISO: vi.fn(() => '2026-07-17T09:30'),
}))

vi.mock('./utils.js', () => ({ fetchSheet, sendToGAS, initLiff, nowLocalISO }))
vi.mock('./GoogleSheetLink.jsx', () => ({ default: () => null }))
vi.mock('../components/LangToggle.jsx', () => ({ default: () => null }))

import AddLog from './AddLog.jsx'

describe('LIFF AddLog interactions', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('lang', 'en')
    window.history.replaceState({}, '', '/?page=log')
    initLiff.mockReset().mockResolvedValue('line-token')
    sendToGAS.mockReset().mockResolvedValue({ status: 'ok' })
    fetchSheet.mockReset().mockImplementation(sheet => Promise.resolve(sheet === 'pets'
      ? [{ id: 'pet-1', name: 'Mochi', active: 'TRUE' }]
      : [{ key: 'symptom', label_en: 'Symptom', icon: '🤒', needs_detail: 'TRUE', active: 'TRUE', order: '1' }]))
  })

  it('saves the selected pet/type/detail to GAS and visibly clears the saved form data', async () => {
    const { container } = render(<AddLog />)

    expect(await screen.findByRole('button', { name: /Symptom/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Symptom/ }))
    const detail = screen.getByPlaceholderText(/dark yellow pee/)
    fireEvent.change(detail, { target: { value: '  coughing after walk  ' } })
    fireEvent.change(container.querySelector('input[type="datetime-local"]'), { target: { value: '2026-07-17T10:15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(sendToGAS).toHaveBeenCalledWith({
      action: 'addLog', pet_id: 'pet-1', type: 'symptom', datetime: '2026-07-17T10:15', detail: 'coughing after walk',
    }))
    expect(detail.value).toBe('')
    expect(screen.getByText(/Saved/)).toBeTruthy()
    expect(initLiff).toHaveBeenCalledWith('log')
  })

  it('retains the form and exposes a durable retry action after a failed write', async () => {
    sendToGAS.mockRejectedValueOnce(new Error('GAS unavailable'))
    render(<AddLog />)
    fireEvent.click(await screen.findByRole('button', { name: /Symptom/ }))
    const detail = screen.getByPlaceholderText(/dark yellow pee/)
    fireEvent.change(detail, { target: { value: 'keep this detail' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain('GAS unavailable')
    expect(detail.value).toBe('keep this detail')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})
