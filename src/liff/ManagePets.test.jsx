import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchSheet, initLiff } = vi.hoisted(() => ({ fetchSheet: vi.fn(), initLiff: vi.fn() }))

vi.mock('./utils.js', () => ({ fetchSheet, initLiff, sendToGAS: vi.fn(), genId: vi.fn() }))
vi.mock('./GoogleSheetLink.jsx', () => ({ default: () => null }))

import ManagePets from './ManagePets.jsx'

describe('ManagePets loading recovery', () => {
  beforeEach(() => {
    fetchSheet.mockReset()
    initLiff.mockReset().mockResolvedValue('line-token')
  })

  it('keeps the load failure visible and loads data after Retry', async () => {
    fetchSheet
      .mockRejectedValueOnce(new Error('Sheet unavailable'))
      .mockResolvedValueOnce([{ id: 'pet-1', name: 'Mochi', species: 'dog', active: 'TRUE' }])

    render(<ManagePets />)

    expect((await screen.findByRole('alert')).textContent).toContain('Sheet unavailable')
    expect(screen.queryByText('Mochi')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByText('Mochi')).toBeTruthy())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(fetchSheet).toHaveBeenCalledTimes(2)
  })
})
