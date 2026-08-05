import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary.jsx'
import { clearSyncLog, getSyncLog } from '../syncDebugLog.js'

function ThrowingChild() {
  throw new Error('setItem failed: QuotaExceededError')
}

describe('ErrorBoundary', () => {
  let consoleError

  beforeEach(() => {
    clearSyncLog()
    // React logs caught boundary errors to console.error by design; the noise
    // would otherwise drown the suite output.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
    clearSyncLog()
  })

  it('renders children untouched when nothing throws', () => {
    render(<ErrorBoundary><p>ปกติ</p></ErrorBoundary>)

    expect(screen.getByText('ปกติ')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'โหลดหน้าใหม่' })).toBeNull()
  })

  it('shows the fallback screen instead of unmounting when a child throws', () => {
    render(<ErrorBoundary><ThrowingChild /></ErrorBoundary>)

    expect(screen.getByText('เกิดข้อผิดพลาดที่ไม่คาดคิด')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'โหลดหน้าใหม่' })).toBeTruthy()
  })

  it('records an app_crashed entry in the sync debug log', () => {
    render(<ErrorBoundary><ThrowingChild /></ErrorBoundary>)

    const crashes = getSyncLog().filter(entry => entry.event === 'app_crashed')
    expect(crashes).toHaveLength(1)
    expect(crashes[0].message).toContain('QuotaExceededError')
  })

  it('redacts identifiers out of the logged crash message', () => {
    function ThrowingWithId() {
      throw new Error('save failed /spreadsheets/1BxiMVs0XRAV5cUZ11223344556677889900aaBB/values:batchUpdate')
    }
    render(<ErrorBoundary><ThrowingWithId /></ErrorBoundary>)

    const crash = getSyncLog().find(entry => entry.event === 'app_crashed')
    expect(crash.message).not.toContain('1BxiMVs0XRAV5cUZ11223344556677889900aaBB')
    expect(crash.message).toContain('/spreadsheets/…')
  })

  it('still renders the fallback when crash logging itself fails', () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    try {
      expect(() => render(<ErrorBoundary><ThrowingChild /></ErrorBoundary>)).not.toThrow()
      expect(screen.getByText('เกิดข้อผิดพลาดที่ไม่คาดคิด')).toBeTruthy()
    } finally {
      setItem.mockRestore()
    }
  })

  it('reloads the page when the reload button is pressed', () => {
    const reload = vi.fn()
    const original = window.location
    delete window.location
    window.location = { ...original, reload }
    try {
      render(<ErrorBoundary><ThrowingChild /></ErrorBoundary>)
      fireEvent.click(screen.getByRole('button', { name: 'โหลดหน้าใหม่' }))
      expect(reload).toHaveBeenCalled()
    } finally {
      window.location = original
    }
  })

  it('only catches errors from its own subtree', () => {
    render(
      <div>
        <ErrorBoundary><ThrowingChild /></ErrorBoundary>
        <p>ส่วนอื่นยังอยู่</p>
      </div>
    )

    expect(screen.getByText('เกิดข้อผิดพลาดที่ไม่คาดคิด')).toBeTruthy()
    expect(screen.getByText('ส่วนอื่นยังอยู่')).toBeTruthy()
  })
})
