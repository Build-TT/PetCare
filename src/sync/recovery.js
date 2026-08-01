const OUTBOX_KEY = 'petcare.sync-outbox.v1'
const LEGACY_OUTBOX_KEY = 'petcare.remote-outbox.v1'

export function exportLocalRecoveryBundle(storage) {
  const read = key => {
    try { return JSON.parse(storage.getItem(key) || 'null') } catch { return null }
  }
  return {
    format: 'petcare-recovery-v1',
    exported_at: new Date().toISOString(),
    state: read('petcare.local.v1') || {},
    outbox: read(OUTBOX_KEY) || [],
    legacy_outbox: read(LEGACY_OUTBOX_KEY),
    sheet: read('petcare.google-sheet.v1') || read('petcare.google.v1'),
  }
}
