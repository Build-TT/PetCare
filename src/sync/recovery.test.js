import { describe, expect, it } from 'vitest'
import { exportLocalRecoveryBundle } from './recovery.js'

describe('local recovery bundle', () => {
  it('exports local state and pending queues without access tokens', () => {
    const storage = { getItem: key => ({
      'petcare.local.v1': JSON.stringify({ logs: [{ id: 'one' }] }),
      'petcare.remote-outbox.v1': JSON.stringify({ state: { logs: [{ id: 'two' }] } }),
      'petcare.google.v1': JSON.stringify({ spreadsheetId: 'sheet-1' }),
    }[key] || null) }
    const bundle = exportLocalRecoveryBundle(storage)
    expect(bundle.state.logs).toHaveLength(1)
    expect(bundle.legacy_outbox.state.logs).toHaveLength(1)
    expect(JSON.stringify(bundle)).not.toContain('accessToken')
  })
})
