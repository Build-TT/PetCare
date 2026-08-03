import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { loadRemoteStateMock, saveRemoteStateMock, requestGoogleAccessTokenMock, ensureGoogleAccessTokenMock, clearGoogleTokenCacheMock, getGoogleUserProfileMock, createSheetMock } = vi.hoisted(() => ({
  loadRemoteStateMock: vi.fn(),
  saveRemoteStateMock: vi.fn(),
  requestGoogleAccessTokenMock: vi.fn(),
  ensureGoogleAccessTokenMock: vi.fn(),
  clearGoogleTokenCacheMock: vi.fn(),
  getGoogleUserProfileMock: vi.fn(),
  createSheetMock: vi.fn(),
}))

vi.mock('./remoteState.js', async () => {
  const actual = await vi.importActual('./remoteState.js')
  return { ...actual, loadRemoteState: loadRemoteStateMock, saveRemoteState: saveRemoteStateMock }
})
vi.mock('./googleAuth.js', () => ({
  isGoogleConfigured: () => true,
  loadGoogleIdentityServices: () => Promise.resolve(),
  requestGoogleAccessToken: requestGoogleAccessTokenMock,
  ensureGoogleAccessToken: ensureGoogleAccessTokenMock,
  clearGoogleTokenCache: clearGoogleTokenCacheMock,
  getGoogleUserProfile: getGoogleUserProfileMock,
}))
vi.mock('./googleSheets.js', () => ({ createOrFindPetCareSheet: createSheetMock, listPetCareSheets: vi.fn().mockResolvedValue([]) }))

import App from './App.jsx'

const OUTBOX_KEY = 'petcare.remote-outbox.v1'
const remote = { tracks: [], logs: [], activities: [], reminders: [], symptoms: [], treatmentHistory: [], lineRecipients: [], pets: [{ id: 'p1', name: 'Remote pet' }], activePetId: 'p1' }
// A child device that already knows its shared Sheet: the boot restore runs
// handleGoogleConnected on its own, without any onboarding click.
const childSession = { session_token: 'child-token', user: { username: 'child', email: 'child@example.com', spreadsheet_id: 'sheet-1', role: 'user' } }
const pendingLog = { id: 'log_pending', pet_id: 'p1', datetime: '2026-08-03T09:00', symptom: 'ซึม', diary: 'รอซิงก์', tracks: [] }
// The save effect debounces by 500ms; a little headroom keeps assertions off the edge.
const DEBOUNCE = 600

// Only the timer functions are faked, so promises still settle on real
// microtasks. `waitFor` deadlocks under fake timers, hence the explicit drain.
async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
    for (let index = 0; index < 5; index += 1) await Promise.resolve()
  })
}

async function connectSheet() {
  fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
  fireEvent.click(screen.getByRole('button', { name: /Google Sheet/ }))
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ Google/ }))
  await advance(0)
  expect(loadRemoteStateMock).toHaveBeenCalled()
}

describe('App auto-retries failed Google Sheet saves', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    window.localStorage.clear()
    loadRemoteStateMock.mockReset().mockResolvedValue(remote)
    saveRemoteStateMock.mockReset().mockResolvedValue({ status: 'ok' })
    requestGoogleAccessTokenMock.mockReset().mockResolvedValue('google-token')
    ensureGoogleAccessTokenMock.mockReset().mockResolvedValue('google-token')
    getGoogleUserProfileMock.mockReset().mockResolvedValue({ email: 'owner@example.com' })
    createSheetMock.mockReset().mockResolvedValue({ spreadsheetId: 'sheet-1', spreadsheetUrl: 'https://sheet.test', name: 'PetCare', created: false })
  })

  afterEach(() => { vi.useRealTimers() })

  it('retries a failed save on its own and drains the outbox without any user edit', async () => {
    saveRemoteStateMock.mockRejectedValueOnce(new Error('เครือข่ายล่ม')).mockResolvedValue({ status: 'ok' })
    render(<App />)
    await connectSheet()

    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(OUTBOX_KEY)).not.toBeNull()

    await advance(5000)
    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(2)
    expect(window.localStorage.getItem(OUTBOX_KEY)).toBeNull()
  })

  it('spaces the retries 5s, 15s then 60s apart while the save keeps failing', async () => {
    saveRemoteStateMock.mockRejectedValue(new Error('เครือข่ายล่ม'))
    render(<App />)
    await connectSheet()

    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(1)

    await advance(4000)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(1)
    await advance(1500)
    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(2)

    await advance(14000)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(2)
    await advance(1500)
    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(3)

    await advance(59000)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(3)
    await advance(1500)
    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(4)

    // The delay is capped, never abandoned: the next wait is 60s again.
    await advance(59000)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(4)
    await advance(1500)
    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(5)
  })

  it('cancels every pending retry once a save succeeds', async () => {
    saveRemoteStateMock.mockRejectedValueOnce(new Error('เครือข่ายล่ม')).mockResolvedValue({ status: 'ok' })
    render(<App />)
    await connectSheet()

    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(1)
    await advance(5000)
    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(2)
    expect(window.localStorage.getItem(OUTBOX_KEY)).toBeNull()

    await advance(180000)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(2)
  })

  it('retries immediately when the browser comes back online while the sync is failing', async () => {
    saveRemoteStateMock.mockRejectedValueOnce(new Error('เครือข่ายล่ม')).mockResolvedValue({ status: 'ok' })
    render(<App />)
    await connectSheet()

    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(1)

    await act(async () => { window.dispatchEvent(new Event('online')) })
    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(2)
    expect(window.localStorage.getItem(OUTBOX_KEY)).toBeNull()

    // A healthy sync must not re-save on every online event.
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(2)
  })

  it('retries immediately when the tab becomes visible again while the sync is failing', async () => {
    saveRemoteStateMock.mockRejectedValueOnce(new Error('เครือข่ายล่ม')).mockResolvedValue({ status: 'ok' })
    render(<App />)
    await connectSheet()

    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(1)

    // App already refreshes from the Sheet on visibilitychange; making that
    // read fail keeps it from changing state, so only the retry can save again.
    loadRemoteStateMock.mockRejectedValue(new Error('อ่านไม่สำเร็จ'))
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(2)
  })

  // The reported child-device failure: VITE_GAS_URL pointed at a dead Apps
  // Script deployment, so the very first load failed. remoteReady never turned
  // true, the save effect never ran, and the outbox sat there for good.
  it('re-drives the connect when the first remote load failed, so a boot outage still recovers', async () => {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify({ revision: 3, state: { ...remote, logs: [pendingLog] } }))
    loadRemoteStateMock.mockRejectedValueOnce(new Error('ไม่พบปลายทาง Apps Script (404)')).mockResolvedValue(remote)
    render(<App accountSession={childSession} />)
    await advance(0)

    expect(loadRemoteStateMock).toHaveBeenCalledTimes(1)
    expect(saveRemoteStateMock).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(OUTBOX_KEY)).not.toBeNull()

    await advance(5000)
    await advance(DEBOUNCE)
    expect(loadRemoteStateMock).toHaveBeenCalledTimes(2)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(1)
    expect(saveRemoteStateMock.mock.calls[0][2].logs.some(log => log.id === 'log_pending')).toBe(true)
    expect(window.localStorage.getItem(OUTBOX_KEY)).toBeNull()
  })

  it('re-drives the connect immediately when the browser comes back online after a failed boot load', async () => {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify({ revision: 3, state: { ...remote, logs: [pendingLog] } }))
    loadRemoteStateMock.mockRejectedValueOnce(new Error('ไม่พบปลายทาง Apps Script (404)')).mockResolvedValue(remote)
    render(<App accountSession={childSession} />)
    await advance(0)
    expect(loadRemoteStateMock).toHaveBeenCalledTimes(1)

    await act(async () => { window.dispatchEvent(new Event('online')) })
    await advance(DEBOUNCE)
    expect(loadRemoteStateMock).toHaveBeenCalledTimes(2)
    expect(window.localStorage.getItem(OUTBOX_KEY)).toBeNull()
  })

  it('keeps backing off the connect while the backend stays dead, then stops on unmount', async () => {
    loadRemoteStateMock.mockRejectedValue(new Error('ไม่พบปลายทาง Apps Script (404)'))
    const view = render(<App accountSession={childSession} />)
    await advance(0)
    expect(loadRemoteStateMock).toHaveBeenCalledTimes(1)

    await advance(4000)
    expect(loadRemoteStateMock).toHaveBeenCalledTimes(1)
    await advance(1500)
    expect(loadRemoteStateMock).toHaveBeenCalledTimes(2)

    await advance(14000)
    expect(loadRemoteStateMock).toHaveBeenCalledTimes(2)
    await advance(1500)
    expect(loadRemoteStateMock).toHaveBeenCalledTimes(3)

    view.unmount()
    await advance(180000)
    expect(loadRemoteStateMock).toHaveBeenCalledTimes(3)
  })

  it('stops the retry timer when the app unmounts', async () => {
    saveRemoteStateMock.mockRejectedValue(new Error('เครือข่ายล่ม'))
    const view = render(<App />)
    await connectSheet()

    await advance(DEBOUNCE)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(1)

    view.unmount()
    await advance(180000)
    expect(saveRemoteStateMock).toHaveBeenCalledTimes(1)
  })
})
