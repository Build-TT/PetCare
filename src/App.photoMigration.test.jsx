import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { compressPhotoToDataUrlMock } = vi.hoisted(() => ({
  compressPhotoToDataUrlMock: vi.fn(),
}))

vi.mock('./photo.js', () => ({
  compressPhotoToDataUrl: compressPhotoToDataUrlMock,
}))

import App from './App.jsx'

const LOCAL_STATE_KEY = 'petcare.local.v1'
// Comfortably past the 45,000-char migration threshold.
const bigPhoto = `data:image/jpeg;base64,${'A'.repeat(50000)}`

describe('one-time pet photo migration', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState({}, '', '/')
    compressPhotoToDataUrlMock.mockReset().mockResolvedValue('small')
  })

  // React.StrictMode double-invokes mount effects in development (mount ->
  // cleanup -> mount again) specifically to surface effects that assume they
  // only ever run once cleanly. The real app is rendered inside StrictMode
  // (see src/main.jsx), so the migration must actually land under it too —
  // not just under a plain, un-wrapped render.
  it('recompresses an oversized stored photo exactly once, even under StrictMode double-invoked effects', async () => {
    window.localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({
      tracks: [], logs: [], activities: [], reminders: [], symptoms: [], treatmentHistory: [], lineRecipients: [],
      pets: [{ id: 'p1', name: 'โมจิ', species: 'dog', photo: bigPhoto }],
      activePetId: 'p1',
    }))

    render(<StrictMode><App /></StrictMode>)

    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY))
      expect(saved.pets[0].photo).toBe('small')
    })
    expect(compressPhotoToDataUrlMock).toHaveBeenCalledTimes(1)
    expect(compressPhotoToDataUrlMock).toHaveBeenCalledWith(bigPhoto)

    // A later re-render (navigating between pages) must not re-trigger the
    // one-time migration — this is the loop guard.
    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    fireEvent.click(screen.getByRole('button', { name: 'หน้าหลัก' }))
    expect(compressPhotoToDataUrlMock).toHaveBeenCalledTimes(1)
  })

  it('leaves a photo under the threshold untouched and never calls the compressor', async () => {
    const smallPhoto = 'data:image/jpeg;base64,short'
    window.localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify({
      tracks: [], logs: [], activities: [], reminders: [], symptoms: [], treatmentHistory: [], lineRecipients: [],
      pets: [{ id: 'p1', name: 'โมจิ', species: 'dog', photo: smallPhoto }],
      activePetId: 'p1',
    }))

    render(<StrictMode><App /></StrictMode>)
    fireEvent.click(await screen.findByRole('button', { name: 'สมุดบันทึก' }))

    expect(compressPhotoToDataUrlMock).not.toHaveBeenCalled()
    const saved = JSON.parse(window.localStorage.getItem(LOCAL_STATE_KEY))
    expect(saved.pets[0].photo).toBe(smallPhoto)
  })
})
