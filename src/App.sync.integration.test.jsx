import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
import { getSyncLog } from './syncDebugLog.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const staleRemote = {
  tracks: [], logs: [], activities: [], reminders: [], symptoms: [],
  pets: [{ id: 'p1', name: 'Remote pet' }], activePetId: 'p1',
}

describe('App remote sync integration', () => {
  beforeEach(() => {
    window.localStorage.clear()
    loadRemoteStateMock.mockReset().mockResolvedValue(staleRemote)
    saveRemoteStateMock.mockReset().mockResolvedValue({ status: 'ok' })
    requestGoogleAccessTokenMock.mockReset().mockResolvedValue('google-token')
    ensureGoogleAccessTokenMock.mockReset().mockResolvedValue('google-token')
    getGoogleUserProfileMock.mockReset().mockResolvedValue({ email: 'owner@example.com' })
    createSheetMock.mockReset().mockResolvedValue({ spreadsheetId: 'sheet-1', spreadsheetUrl: 'https://sheet.test', name: 'PetCare', created: false })
  })

  it('serializes remote writes so a newer success cannot finish before an older save, then reloads the latest revision', async () => {
    let remoteState = staleRemote
    loadRemoteStateMock.mockImplementation(() => Promise.resolve(remoteState))
    const saves = []
    saveRemoteStateMock.mockImplementation((_token, _sheetId, state) => {
      const request = deferred()
      saves.push({ ...request, state })
      return request.promise.then(() => { remoteState = structuredClone(state) })
    })
    const connect = async () => {
      fireEvent.click(screen.getByRole('button', { name: /ตั้งค่า/ }))
      fireEvent.click(screen.getByRole('button', { name: /Google Sheet/ }))
      if (!screen.queryByRole('checkbox')) {
        await waitFor(() => expect(loadRemoteStateMock).toHaveBeenCalled())
        return
      }
      fireEvent.click(screen.getByRole('checkbox'))
      fireEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ Google/ }))
      fireEvent.click(screen.getByRole('button', { name: /สร้าง Sheet ใหม่/ }))
      await waitFor(() => expect(loadRemoteStateMock).toHaveBeenCalled())
    }

    const first = render(<App />)
    await connect()
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 1200 })

    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มอาการ/ }))
    const symptomForm = screen.getByLabelText('ฟอร์มเพิ่มอาการ')
    fireEvent.change(within(symptomForm).getByLabelText('ชื่ออาการ'), { target: { value: 'ไข้' } })
    fireEvent.click(within(symptomForm).getByRole('button', { name: 'บันทึกอาการ' }))
    const pending = JSON.parse(window.localStorage.getItem('petcare.remote-outbox.v1'))
    expect(pending.revision).toBeGreaterThan(1)
    expect(pending.state.symptoms.some(item => item.label_th === 'ไข้')).toBe(true)

    // The newer write is queued, so attempting reverse completion is impossible:
    // it has not reached saveRemoteState while the older request is unresolved.
    await new Promise(resolve => window.setTimeout(resolve, 650))
    expect(saves).toHaveLength(1)
    await act(async () => {
      saves[0].resolve({ status: 'ok' })
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => expect(saves).toHaveLength(2))
    expect(saves[1].state.symptoms.some(item => item.label_th === 'ไข้')).toBe(true)
    await act(async () => {
      saves[1].resolve({ status: 'ok' })
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() => expect(window.localStorage.getItem('petcare.remote-outbox.v1')).toBeNull())
    expect(remoteState.symptoms.some(item => item.label_th === 'ไข้')).toBe(true)

    first.unmount()
    window.localStorage.removeItem('petcare.local.v1')
    render(<App />)
    await connect()
    fireEvent.click(screen.getByRole('button', { name: /สร้าง Sheet ใหม่/ }))
    await waitFor(() => expect(loadRemoteStateMock).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    expect(screen.getByRole('button', { name: 'ไข้' })).toBeTruthy()
  })

  it('shows Sheet records that carry no pet_id once more than one pet exists', async () => {
    // belongsToPet hides an unowned record whenever there are 2+ pets, and the
    // legacy-owner migration only ever ran on localStorage. Rows written before
    // multi-pet support therefore sat in the Sheet, fully intact, and never
    // appeared in the app.
    loadRemoteStateMock.mockResolvedValue({
      tracks: [], activities: [], reminders: [], symptoms: [], treatmentHistory: [], lineRecipients: [],
      pets: [{ id: 'p1', name: 'หนึ่ง' }, { id: 'p2', name: 'สอง' }],
      logs: [{ id: 'orphan', datetime: '2026-07-20T08:00', symptom: 'ซึม', diary: 'บันทึกที่ไม่มีเจ้าของ', tracks: [] }],
      activePetId: 'p1',
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
    fireEvent.click(screen.getByRole('button', { name: /Google Sheet/ }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ Google/ }))
    await waitFor(() => expect(loadRemoteStateMock).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'หน้าหลัก' }))
    await waitFor(() => expect(screen.getByText(/1 อาการ/)).toBeTruthy())
  })

  it('sends a newly created activity and optional duration to the connected Google Sheet save', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
    fireEvent.click(screen.getByRole('button', { name: /Google Sheet/ }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ Google/ }))
    await waitFor(() => expect(loadRemoteStateMock).toHaveBeenCalled())
    await waitFor(() => expect(saveRemoteStateMock).toHaveBeenCalled(), { timeout: 1500 })
    saveRemoteStateMock.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    fireEvent.click(screen.getByRole('button', { name: 'กิจวัตร' }))
    fireEvent.click(screen.getByRole('button', { name: /บันทึกกิจวัตร/ }))
    const form = screen.getByLabelText('ฟอร์มกิจวัตร')
    fireEvent.change(within(form).getByLabelText('ประเภทกิจวัตร'), { target: { value: 'เดิน' } })
    fireEvent.change(within(form).getByLabelText('วันและเวลา'), { target: { value: '2026-07-17T18:30' } })
    fireEvent.change(within(form).getByLabelText(/ระยะเวลา/), { target: { value: '30' } })
    fireEvent.change(within(form).getByLabelText('Note'), { target: { value: 'เดินรอบสวน' } })
    fireEvent.click(within(form).getByRole('button', { name: 'บันทึกกิจวัตร' }))

    await waitFor(() => expect(saveRemoteStateMock).toHaveBeenCalled(), { timeout: 1500 })
    expect(saveRemoteStateMock.mock.calls.at(-1)[2].activities).toEqual([
      expect.objectContaining({ activity_type: 'เดิน', datetime: '2026-07-17T18:30', duration_minutes: '30', note: 'เดินรอบสวน' }),
    ])
  })

  it('records connect and save lifecycle events to the sync debug log on a successful connect and save', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
    fireEvent.click(screen.getByRole('button', { name: /Google Sheet/ }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ Google/ }))
    await waitFor(() => expect(loadRemoteStateMock).toHaveBeenCalled())

    await waitFor(() => {
      const events = getSyncLog().map(entry => entry.event)
      expect(events).toContain('connect_start')
      expect(events).toContain('connect_remote_loaded')
      expect(events).toContain('connect_merged')
    })

    await waitFor(() => expect(saveRemoteStateMock).toHaveBeenCalled(), { timeout: 1500 })
    await waitFor(() => {
      const log = getSyncLog()
      const saveStart = log.find(entry => entry.event === 'save_start')
      const saveSuccess = log.find(entry => entry.event === 'save_success')
      expect(saveStart).toBeTruthy()
      expect(saveSuccess).toBeTruthy()
      expect(saveSuccess.revision).toBe(saveStart.revision)
    })
  })

  it('records a save_error entry with the rejection message when a save fails', async () => {
    saveRemoteStateMock.mockReset().mockRejectedValue(new Error('Google Sheet save failed: network down'))
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
    fireEvent.click(screen.getByRole('button', { name: /Google Sheet/ }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ Google/ }))
    await waitFor(() => expect(loadRemoteStateMock).toHaveBeenCalled())

    await waitFor(() => expect(saveRemoteStateMock).toHaveBeenCalled(), { timeout: 1500 })
    await waitFor(() => {
      const saveError = getSyncLog().find(entry => entry.event === 'save_error')
      expect(saveError).toBeTruthy()
      expect(saveError.message).toContain('Google Sheet save failed: network down')
    })
  })

  it('surfaces a sync error and skips the network save when the outbox write fails', async () => {
    // A failed outbox write is no longer a crash, but it must not be silent
    // either: the debug log cannot record a storage failure through the same
    // storage that just failed, so the in-memory sync error is the only signal
    // the user (or a screenshot in a bug report) ever gets.
    // Spied on the prototype: jsdom's localStorage is proxy-backed, so an
    // own-property spy on the instance is not reliably consulted.
    const realSetItem = Storage.prototype.setItem
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'petcare.remote-outbox.v1') throw new Error('QuotaExceededError')
      return realSetItem.call(this, key, value)
    })
    try {
      render(<App />)

      fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
      fireEvent.click(screen.getByRole('button', { name: /Google Sheet/ }))
      fireEvent.click(screen.getByRole('checkbox'))
      fireEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ Google/ }))
      await waitFor(() => expect(loadRemoteStateMock).toHaveBeenCalled())

      await waitFor(() => expect(screen.getByText(/พื้นที่จัดเก็บอาจเต็ม/)).toBeTruthy())
      // Well past the 500ms debounce: the network save must never be attempted
      // with data that could not be durably recorded locally first.
      await new Promise(resolve => window.setTimeout(resolve, 650))
      expect(saveRemoteStateMock).not.toHaveBeenCalled()
    } finally {
      setItemSpy.mockRestore()
    }
  })

  it('redacts a full spreadsheet id embedded in a rejection message before it reaches the sync debug log', async () => {
    // Mirrors the shape apiFetch() in googleSheets.js throws on a Sheets API
    // error: the full spreadsheet id sits in the URL pathname. Logging this
    // verbatim would defeat the deliberate 6-char truncation used elsewhere
    // (connect_start's sheetSuffix).
    const fullSpreadsheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
    saveRemoteStateMock.mockReset().mockRejectedValue(
      new Error(`Google API error (429) [429 /v4/spreadsheets/${fullSpreadsheetId}/values:batchUpdate]`),
    )
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
    fireEvent.click(screen.getByRole('button', { name: /Google Sheet/ }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ Google/ }))
    await waitFor(() => expect(loadRemoteStateMock).toHaveBeenCalled())

    await waitFor(() => expect(saveRemoteStateMock).toHaveBeenCalled(), { timeout: 1500 })
    await waitFor(() => {
      const saveError = getSyncLog().find(entry => entry.event === 'save_error')
      expect(saveError).toBeTruthy()
      expect(saveError.message).not.toContain(fullSpreadsheetId)
      expect(saveError.message).toContain('/v4/spreadsheets/…/values:batchUpdate')
    })
    // The full id must not appear anywhere in the persisted log, not just the
    // one field asserted above.
    expect(JSON.stringify(getSyncLog())).not.toContain(fullSpreadsheetId)
  })

  it('redacts a full spreadsheet id embedded in a connect-failure message before it reaches the sync debug log', async () => {
    const fullSpreadsheetId = '1CyjNWt1YSB6oGNeLwCeCcKhVVrqumcs85PhwF3vqnt'
    loadRemoteStateMock.mockReset().mockRejectedValue(
      new Error(`Google API error (403) [403 /v4/spreadsheets/${fullSpreadsheetId}]`),
    )
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
    fireEvent.click(screen.getByRole('button', { name: /Google Sheet/ }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ Google/ }))
    await waitFor(() => expect(loadRemoteStateMock).toHaveBeenCalled())

    await waitFor(() => {
      const connectFailed = getSyncLog().find(entry => entry.event === 'connect_failed')
      expect(connectFailed).toBeTruthy()
      expect(connectFailed.message).not.toContain(fullSpreadsheetId)
    })
    expect(JSON.stringify(getSyncLog())).not.toContain(fullSpreadsheetId)
  })
})
