import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchSheet, sendToGAS, initLiff, store } = vi.hoisted(() => ({
  fetchSheet: vi.fn(), sendToGAS: vi.fn(), initLiff: vi.fn(), store: { types: [] },
}))

vi.mock('./utils.js', () => ({ fetchSheet, sendToGAS, initLiff }))
vi.mock('./GoogleSheetLink.jsx', () => ({ default: () => null }))
vi.mock('../components/LangToggle.jsx', () => ({ default: () => null }))

import ManageTypes from './ManageTypes.jsx'

describe('LIFF ManageTypes interactions', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('lang', 'en')
    store.types = [{ key: 'vomit', label_th: 'อาเจียน', label_en: 'Vomit', icon: '🤮', active: 'TRUE', order: '1' }]
    initLiff.mockReset().mockResolvedValue('line-token')
    fetchSheet.mockReset().mockImplementation(() => Promise.resolve(store.types.map(row => ({ ...row }))))
    sendToGAS.mockReset().mockImplementation(async payload => {
      if (payload.action === 'addLogType') store.types.push({ ...payload, active: 'TRUE' })
      if (payload.action === 'editLogType' && payload.active === 'FALSE') {
        store.types = store.types.map(row => row.key === payload.key ? { ...row, active: 'FALSE' } : row)
      } else if (payload.action === 'editLogType') {
        store.types = store.types.map(row => row.key === payload.key ? { ...row, ...payload } : row)
      }
      return { status: 'ok' }
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('edits, soft-deletes, and creates log types through GAS with reloaded UI state', async () => {
    render(<ManageTypes />)
    expect(await screen.findByText('Vomit')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByDisplayValue('Vomit'), { target: { value: 'Vomiting' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(sendToGAS).toHaveBeenCalledWith(expect.objectContaining({
      action: 'editLogType', key: 'vomit', label_en: 'Vomiting', label_th: 'อาเจียน', icon: '🤮',
    })))
    expect(await screen.findByText('Vomiting')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(sendToGAS).toHaveBeenCalledWith({ action: 'editLogType', key: 'vomit', active: 'FALSE' }))
    await waitFor(() => expect(screen.queryByText('Vomiting')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /Add/ }))
    fireEvent.change(screen.getByPlaceholderText('🤮'), { target: { value: '⚖️' } })
    const textboxes = screen.getAllByRole('textbox')
    fireEvent.change(textboxes[1], { target: { value: '' } })
    fireEvent.change(textboxes[2], { target: { value: 'Weight' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(sendToGAS).toHaveBeenCalledWith(expect.objectContaining({
      action: 'addLogType', label_th: 'Weight', label_en: 'Weight', icon: '⚖️', needs_detail: 'FALSE',
    })))
    expect(await screen.findByText('Weight')).toBeTruthy()
    expect(initLiff).toHaveBeenCalledWith('types')
  })
})
