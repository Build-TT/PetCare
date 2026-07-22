import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LineGroupSettings from './LineGroupSettings.jsx'

describe('LINE group settings', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('loads groups and requires a fresh selection when the settings screen opens', async () => {
    const groups = [
      { group_id: 'C111111', group_name: 'บ้านโมจิ', picture_url: '' },
      { group_id: 'C222222', group_name: 'ทีมคุณหมอ', picture_url: '' },
    ]
    window.localStorage.setItem('petcare.line-group.v1', JSON.stringify({ groupId: 'C111111', groupName: 'บ้านโมจิ' }))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok', groups, selected_group_id: 'C111111' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok', groups, selected_group_id: 'C222222' }) })
    vi.stubGlobal('fetch', fetchMock)
    const onSelected = vi.fn()

    render(<LineGroupSettings connection={{ accessToken: 'google-token' }} onSelected={onSelected} />)

    await screen.findByText('บ้านโมจิ')
    expect(screen.getByRole('radio', { name: /บ้านโมจิ/ }).checked).toBe(false)
    fireEvent.click(screen.getByRole('radio', { name: /ทีมคุณหมอ/ }))
    fireEvent.click(screen.getByRole('button', { name: 'ใช้กลุ่มนี้รับการแจ้งเตือน' }))

    await waitFor(() => expect(onSelected).toHaveBeenCalledWith({ groupId: 'C222222', groupName: 'ทีมคุณหมอ' }))
    expect(window.localStorage.getItem('petcare.line-group.v1')).toContain('C111111')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer google-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ group_id: 'C222222' }),
    })
  })
})
