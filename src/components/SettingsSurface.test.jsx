import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsSurface from './SettingsSurface.jsx'
import { appendSyncLog, getSyncLog } from '../syncDebugLog.js'

const baseProps = {
  section: '',
  onSectionChange: () => {},
  tracks: [],
  symptoms: [],
  lineRecipients: [],
  reminders: [],
  onOpenTrack: () => {},
  onToggleTrack: () => {},
  onDeleteTrack: () => {},
  onOpenSymptom: () => {},
  onToggleSymptom: () => {},
  onDeleteSymptom: () => {},
  lineUserId: '',
  onLineUserIdChange: () => {},
  onAddLineRecipient: () => {},
  onProvisionLine: () => {},
  lineRecipientError: '',
  trackForm: null,
  symptomForm: null,
  googleProps: {},
  onOpenReminders: () => {},
  onLogout: null,
}

describe('SettingsSurface sync debug log', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('downloads the sync debug log as a Blob when the download button is clicked', () => {
    appendSyncLog('boot', { mode: 'none' })
    appendSyncLog('save_success', { revision: 1 })

    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    render(<SettingsSurface {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'ดาวน์โหลด Sync Debug Log' }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('clears the sync debug log when the clear button is clicked', () => {
    appendSyncLog('boot', { mode: 'none' })
    expect(getSyncLog()).toHaveLength(1)

    render(<SettingsSurface {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'ล้าง Log' }))

    expect(getSyncLog()).toEqual([])
  })
})
