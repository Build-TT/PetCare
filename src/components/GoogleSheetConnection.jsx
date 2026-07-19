import { useEffect, useState } from 'react'
import { getGoogleUserProfile, isGoogleConfigured, requestGoogleAccessToken } from '../googleAuth.js'
import { createOrFindPetCareSheet } from '../googleSheets.js'
import '../googleSheetConnection.css'

const CONNECTION_META_KEY = 'petcare.google-sheet.v1'

export default function GoogleSheetConnection({ onConnected, connection: connectedConnection = null, ariaLabel = 'Google Sheet connection', initialConsentAccepted = false, showConsent = true, buttonLabel = 'เชื่อมต่อ Google' }) {
  const [connection, setConnection] = useState(connectedConnection)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [consentAccepted, setConsentAccepted] = useState(initialConsentAccepted)

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
      const sheet = await createOrFindPetCareSheet(accessToken, profile.email)
      const next = { ...sheet, email: profile.email, accessToken }
      await onConnected?.(next)
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
    return <section className="setting setting-google" aria-label={ariaLabel}>
      <b>Google Sheet</b>
      <small>ยังไม่ได้ตั้งค่า Google OAuth · Demo mode</small>
      <button type="button" className="text-button" disabled>เชื่อมต่อ Google</button>
    </section>
  }

  if (connection) {
    return <section className="setting setting-google" aria-label={ariaLabel}>
      <b>Google Sheet เชื่อมต่อแล้ว</b>
      <small>{connection.email} · {connection.accessToken ? (connection.created ? 'สร้าง Sheet ใหม่แล้ว' : 'พร้อมซิงก์ข้อมูล') : 'จำ Sheet นี้ไว้แล้ว'}</small>
      <a href={connection.spreadsheetUrl} target="_blank" rel="noreferrer">เปิด Google Sheet</a>
      {!connection.accessToken && <button type="button" className="text-button" onClick={() => setConnection(null)}>เชื่อม Google ใหม่เพื่อซิงก์</button>}
    </section>
  }

  return <section className="setting setting-google" aria-label={ariaLabel}>
    <b>Google Sheet</b>
    <small>{busy ? 'กำลังสร้างและเตรียม Sheet…' : 'สร้าง Sheet ส่วนตัวอัตโนมัติ'}</small>
    {showConsent && <label className="google-consent">
      <input type="checkbox" checked={consentAccepted} onChange={event => setConsentAccepted(event.target.checked)} />
      <span>อนุญาตให้ PetCare สร้างและบันทึกข้อมูลใน Google Sheet ของฉัน</span>
    </label>}
    <button type="button" className="text-button" onClick={connect} disabled={busy || !consentAccepted}>{busy ? 'กำลังเชื่อมต่อ…' : buttonLabel}</button>
    {error && <small role="alert" className="danger">{error}</small>}
  </section>
}
