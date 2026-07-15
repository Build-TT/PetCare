import { useState } from 'react'
import { getGoogleUserProfile, isGoogleConfigured, requestGoogleAccessToken } from '../googleAuth.js'
import { createOrFindPetCareSheet } from '../googleSheets.js'
import '../googleSheetConnection.css'

export default function GoogleSheetConnection({ onConnected }) {
  const [connection, setConnection] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const connect = async () => {
    if (!isGoogleConfigured()) return
    setBusy(true)
    setError('')
    try {
      const accessToken = await requestGoogleAccessToken()
      const profile = await getGoogleUserProfile(accessToken)
      if (!profile.email) throw new Error('ไม่พบอีเมลของ Google Account')
      const sheet = await createOrFindPetCareSheet(accessToken, profile.email)
      const next = { ...sheet, email: profile.email, accessToken }
      setConnection(next)
      await onConnected?.(next)
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
    </section>
  }

  if (connection) {
    return <section className="setting setting-google" aria-label="Google Sheet connection">
      <b>Google Sheet เชื่อมต่อแล้ว</b>
      <small>{connection.email} · {connection.created ? 'สร้าง Sheet ใหม่แล้ว' : 'ใช้ Sheet เดิม'}</small>
      <a href={connection.spreadsheetUrl} target="_blank" rel="noreferrer">เปิด Google Sheet</a>
    </section>
  }

  return <section className="setting setting-google" aria-label="Google Sheet connection">
    <b>Google Sheet</b>
    <small>{busy ? 'กำลังสร้างและเตรียม Sheet…' : 'สร้าง Sheet ส่วนตัวอัตโนมัติ'}</small>
    <button type="button" className="text-button" onClick={connect} disabled={busy}>{busy ? 'กำลังเชื่อมต่อ…' : 'เชื่อมต่อ Google'}</button>
    {error && <small role="alert" className="danger">{error}</small>}
  </section>
}
