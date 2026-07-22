import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchSheet, sendToGAS, initLiff, store } = vi.hoisted(() => ({
  fetchSheet: vi.fn(), sendToGAS: vi.fn(), initLiff: vi.fn(), store: { schedules: [] },
}))

vi.mock('./utils.js', () => ({
  fetchSheet, sendToGAS, initLiff,
  todayISO: () => '2026-07-17',
  fmtDateTime: value => value,
}))
vi.mock('./GoogleSheetLink.jsx', () => ({ default: () => null }))
vi.mock('../components/LangToggle.jsx', () => ({ default: () => null }))

import ManageMeds from './ManageMeds.jsx'

describe('LIFF ManageMeds interactions', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('lang', 'en')
    store.schedules = [{
      id: 'med-1', pet_id: 'pet-1', med_name: 'Existing medicine', dose: '1 mg', schedule_type: 'daily',
      config: '{}', time: '08:00', start_date: '2026-07-01', active: 'TRUE',
    }]
    initLiff.mockReset().mockResolvedValue('line-token')
    fetchSheet.mockReset().mockImplementation(sheet => Promise.resolve(sheet === 'pets'
      ? [{ id: 'pet-1', name: 'Mochi', active: 'TRUE' }]
      : store.schedules.map(row => ({ ...row }))))
    sendToGAS.mockReset().mockImplementation(async payload => {
      if (payload.action === 'markMedTaken') {
        store.schedules = store.schedules.map(row => row.id === payload.id ? { ...row, next_due: 'completed-and-reloaded' } : row)
      } else if (payload.action === 'editSchedule') {
        store.schedules = store.schedules.map(row => row.id === payload.id ? { ...row, ...payload, active: 'TRUE' } : row)
      } else if (payload.action === 'deleteSchedule') {
        store.schedules = store.schedules.filter(row => row.id !== payload.id)
      } else if (payload.action === 'addSchedule') {
        store.schedules.push({ ...payload, id: 'med-new', active: 'TRUE' })
      }
      return { status: 'ok' }
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('completes, edits, deletes, and creates schedules through GAS with each reload reflected in the UI', async () => {
    const { container } = render(<ManageMeds />)
    expect(await screen.findByText(/Existing medicine/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Mark taken/ }))
    await waitFor(() => expect(sendToGAS).toHaveBeenCalledWith({ action: 'markMedTaken', id: 'med-1' }))
    expect(await screen.findByText(/completed-and-reloaded/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByDisplayValue('Existing medicine'), { target: { value: 'Updated medicine' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(sendToGAS).toHaveBeenCalledWith(expect.objectContaining({
      action: 'editSchedule', id: 'med-1', pet_id: 'pet-1', med_name: 'Updated medicine', dose: '1 mg',
    })))
    expect(await screen.findByText(/Updated medicine/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(sendToGAS).toHaveBeenCalledWith({ action: 'deleteSchedule', id: 'med-1' }))
    await waitFor(() => expect(screen.queryByText(/Updated medicine/)).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /Add schedule/ }))
    const inputs = container.querySelectorAll('input')
    fireEvent.change(inputs[0], { target: { value: 'New medicine' } })
    fireEvent.change(inputs[1], { target: { value: '5 ml' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(sendToGAS).toHaveBeenCalledWith(expect.objectContaining({
      action: 'addSchedule', id: '', pet_id: 'pet-1', med_name: 'New medicine', dose: '5 ml', schedule_type: 'daily',
    })))
    expect(await screen.findByText(/New medicine/)).toBeTruthy()
    expect(initLiff).toHaveBeenCalledWith('meds')
  })
})
