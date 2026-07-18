import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { loadRemoteStateMock, saveRemoteStateMock, requestGoogleAccessTokenMock, getGoogleUserProfileMock, createSheetMock } = vi.hoisted(() => ({
  loadRemoteStateMock: vi.fn(),
  saveRemoteStateMock: vi.fn(),
  requestGoogleAccessTokenMock: vi.fn(),
  getGoogleUserProfileMock: vi.fn(),
  createSheetMock: vi.fn(),
}))

vi.mock('./remoteState.js', async () => {
  const actual = await vi.importActual('./remoteState.js')
  return { ...actual, loadRemoteState: loadRemoteStateMock, saveRemoteState: saveRemoteStateMock }
})
vi.mock('./googleAuth.js', () => ({
  isGoogleConfigured: () => true,
  requestGoogleAccessToken: requestGoogleAccessTokenMock,
  getGoogleUserProfile: getGoogleUserProfileMock,
}))
vi.mock('./googleSheets.js', () => ({ createOrFindPetCareSheet: createSheetMock }))

import App from './App.jsx'

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
      fireEvent.click(screen.getByRole('checkbox'))
      fireEvent.click(screen.getByRole('button', { name: /เชื่อมต่อ Google/ }))
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
    await waitFor(() => expect(loadRemoteStateMock).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    expect(screen.getByRole('button', { name: 'ไข้' })).toBeTruthy()
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
})
