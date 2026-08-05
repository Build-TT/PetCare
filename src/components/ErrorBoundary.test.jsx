import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary.jsx'
import { clearSyncLog, getSyncLog } from '../syncDebugLog.js'

// appendSyncLog swallows its own failures internally, so breaking localStorage
// can never exercise componentDidCatch's guard — the throw is absorbed before
// it gets there. Only replacing appendSyncLog itself with a throwing stub
// tests the property that guard exists for.
const { appendSyncLogMock } = vi.hoisted(() => ({ appendSyncLogMock: vi.fn() }))
vi.mock('../syncDebugLog.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, appendSyncLog: appendSyncLogMock.mockImplementation((...args) => actual.appendSyncLog(...args)) }
})

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
    vi.unstubAllGlobals()
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

  it('records which subtree failed so an exported log can pinpoint the crash', () => {
    function Inner() {
      throw new Error('nested failure')
    }
    function Outer() {
      return <Inner />
    }
    render(<ErrorBoundary><Outer /></ErrorBoundary>)

    const crash = getSyncLog().find(entry => entry.event === 'app_crashed')
    expect(crash.componentStack).toBeTruthy()
    expect(crash.componentStack).toContain('Inner')
  })

  it('still renders the fallback when crash logging itself throws', () => {
    appendSyncLogMock.mockImplementationOnce(() => { throw new Error('boom') })

    expect(() => render(<ErrorBoundary><ThrowingChild /></ErrorBoundary>)).not.toThrow()
    expect(screen.getByText('เกิดข้อผิดพลาดที่ไม่คาดคิด')).toBeTruthy()
    expect(appendSyncLogMock).toHaveBeenCalled()
  })

  it('reloads the page when the reload button is pressed', () => {
    const reload = vi.fn()
    // Stubbing the global avoids `delete window.location`, which leaves the
    // suite order-dependent and throws in strict mode on a non-configurable
    // property. vi.unstubAllGlobals() in afterEach puts it back.
    vi.stubGlobal('location', { ...window.location, reload })

    render(<ErrorBoundary><ThrowingChild /></ErrorBoundary>)
    fireEvent.click(screen.getByRole('button', { name: 'โหลดหน้าใหม่' }))

    expect(reload).toHaveBeenCalled()
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
