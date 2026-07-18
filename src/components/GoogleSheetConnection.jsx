import { useEffect, useState } from 'react'
import { getGoogleUserProfile, isGoogleConfigured, requestGoogleAccessToken } from '../googleAuth.js'
import { createOrFindPetCareSheet } from '../googleSheets.js'
import '../googleSheetConnection.css'

const CONNECTION_META_KEY = 'petcare.google-sheet.v1'

export default function GoogleSheetConnection({ onConnected, onProvisionLine, lineUserId = '', connection: connectedConnection = null, syncStatus = 'idle', syncError = '', externalError = '' }) {
  const [connection, setConnection] = useState(connectedConnection)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [consentAccepted, setConsentAccepted] = useState(false)

  useEffect(() => {
    if (connectedConnection) setConnection(connectedConnection)
  }, [connectedConnection])

  const connect = async () => {
    if (!isGoogleConfigured() || !consentAccepted) return
    setBusy(true)
    setError('')
    try {
      const accessToken = await requestGoogleAccessToken()
      const profile = await getGoogleUserProfile(accessToken)
      if (!profile.email) throw new Error('ไม่พบอีเมลของ Google Account')
      let cachedConnection = null
      try { cachedConnection = JSON.parse(window.localStorage.getItem(CONNECTION_META_KEY) || 'null') } catch { /* ignore invalid cache */ }
      const preferredSpreadsheetId = cachedConnection?.email === profile.email ? cachedConnection.spreadsheetId : ''
      const sheet = await createOrFindPetCareSheet(accessToken, profile.email, preferredSpreadsheetId)
      const next = { ...sheet, email: profile.email, accessToken }
      await onConnected?.(next)
      if (lineUserId) await onProvisionLine?.(next, lineUserId)
      window.localStorage.setItem(CONNECTION_META_KEY, JSON.stringify({
        email: profile.email,
        spreadsheetId: sheet.spreadsheetId,
        spreadsheetUrl: sheet.spreadsheetUrl,
        name: sheet.name,
      }))
      setConnection(next)
    } catch (connectError) {
      setError(connectError.message || 'เชื่อมต่อ Google Sheet ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (!isGoogleConfigured()) {
    return <section className="setting setting-google" aria-label="Google Sheet connection">
      <b>Google Sheet</b>
      <small>ยังไม่ได้ตั้งค่า Google OAuth · Demo mode</small>
      <button type="button" className="text-button" disabled>เชื่อมต่อ Google</button>
      {externalError && <small role="alert" className="danger">{externalError}</small>}
    </section>
  }

  if (connection) {
    return <section className="setting setting-google" aria-label="Google Sheet connection">
      <b>Google Sheet เชื่อมต่อแล้ว</b>
      <small>{connection.email} · {connection.created ? 'สร้าง Sheet ใหม่แล้ว' : 'ใช้ Sheet เดิม'}</small>
      {syncStatus === 'pending' && <small>มีข้อมูลใหม่รอการบันทึกลง Google Sheet…</small>}
      {syncStatus === 'saving' && <small>กำลังบันทึกข้อมูลลง Google Sheet…</small>}
      {syncStatus === 'saved' && <small>บันทึกลง Google Sheet แล้ว ✓</small>}
      {syncError && <small role="alert" className="danger">บันทึกไม่สำเร็จ: {syncError}</small>}
      <a href={connection.spreadsheetUrl} target="_blank" rel="noreferrer">เปิด Google Sheet</a>
    </section>
  }

  return <section className="setting setting-google" aria-label="Google Sheet connection">
    <b>Google Sheet</b>
    <small>{busy ? 'กำลังสร้างและเตรียม Sheet…' : 'สร้าง Sheet ส่วนตัวอัตโนมัติ'}</small>
    <label className="google-consent">
      <input type="checkbox" checked={consentAccepted} onChange={event => setConsentAccepted(event.target.checked)} />
      <span>อนุญาตให้ PetCare สร้างและบันทึกข้อมูลในไฟล์ Google Sheet ของฉัน</span>
    </label>
    <button type="button" className="text-button" onClick={connect} disabled={busy || !consentAccepted}>{busy ? 'กำลังเชื่อมต่อ…' : 'เชื่อมต่อ Google'}</button>
    {(error || externalError) && <small role="alert" className="danger">{error || externalError}</small>}
  </section>
}
