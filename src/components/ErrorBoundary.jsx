import React from 'react'
import { appendSyncLog, redactSyncErrorMessage } from '../syncDebugLog.js'

// Last-resort guard. Without a boundary anywhere above the tree, React 18
// unmounts the entire app when any render/commit/effect throws — the user sees
// a blank page and closes the app, which is how a failed localStorage write
// turned into a "my data disappeared" report. React scopes a boundary to its
// own subtree automatically; no extra logic is needed to keep it from
// swallowing errors raised elsewhere.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    // Guarded on purpose: appendSyncLog already swallows its own failures, but
    // crash handling must not depend on that contract holding. A throw here
    // would escape to the next boundary up (there is none) and cost the user
    // the fallback screen this class exists to show.
    try {
      appendSyncLog('app_crashed', {
        message: redactSyncErrorMessage(error?.message || String(error)),
      })
    } catch {
      // Diagnostics are best-effort; the fallback UI is not.
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{ padding: 24, textAlign: 'center' }} role="alert">
        <h2>เกิดข้อผิดพลาดที่ไม่คาดคิด</h2>
        <p>ข้อมูลที่บันทึกไว้ในเครื่องยังอยู่ครบ ลองโหลดหน้าใหม่อีกครั้ง</p>
        <button type="button" className="primary" onClick={() => window.location.reload()}>โหลดหน้าใหม่</button>
      </div>
    )
  }
}
