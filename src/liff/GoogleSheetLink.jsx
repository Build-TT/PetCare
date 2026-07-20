import { useState } from 'react'
import { isGoogleConfigured, requestGoogleAccessToken } from '../googleAuth.js'
import { initLiff, linkGoogleSheet } from './utils.js'
import { S, tap } from '../ui.js'

export default function GoogleSheetLink({ pageKey = 'log', onLinked }) {
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function connect() {
    if (!consent || busy) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await initLiff(pageKey)
      const googleAccessToken = await requestGoogleAccessToken()
      const result = await linkGoogleSheet(googleAccessToken)
      setSuccess(`เชื่อม Google Sheet แล้ว${result?.spreadsheet_name ? `: ${result.spreadsheet_name}` : ''}`)
      setConsent(false)
      await onLinked?.(result)
    } catch (connectError) {
      setError(connectError.message || 'เชื่อม Google Sheet ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    if (busy) return
    setConsent(false)
    setError('')
    setSuccess('')
  }

  return <section style={{ ...S.card, marginTop: 12 }} aria-label="Google Sheet linking">
    <b>เชื่อม Google Sheet</b>
    {!isGoogleConfigured() && <p role="alert" style={S.danger}>ยังไม่ได้ตั้งค่า Google OAuth</p>}
    <label style={{ ...S.row, alignItems: 'flex-start', marginTop: 8 }}>
      <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy || !isGoogleConfigured()} />
      <span style={{ fontSize: 13 }}>ฉันยินยอมให้ PetCare ตรวจสอบ Google account และเชื่อม Sheet ที่ฉันเป็นเจ้าของกับ LINE account นี้</span>
    </label>
    <div style={{ ...S.row, marginTop: 8 }}>
      <button style={S.primary} disabled={busy || !consent || !isGoogleConfigured()} {...tap(connect)}>
        {busy ? 'กำลังเชื่อมต่อ…' : error ? 'ลองเชื่อมต่ออีกครั้ง' : 'เชื่อมต่อ Google'}
      </button>
      {(consent || error || success) && <button style={S.ghost} disabled={busy} {...tap(cancel)}>ยกเลิก</button>}
    </div>
    {error && <p role="alert" style={S.danger}>{error}</p>}
    {success && <p role="status" style={S.muted}>{success}</p>}
  </section>
}
