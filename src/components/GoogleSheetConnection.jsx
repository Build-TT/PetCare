import { useEffect, useState } from 'react'
import { getGoogleUserProfile, isGoogleConfigured, requestGoogleAccessToken } from '../googleAuth.js'
import { createOrFindPetCareSheet, listPetCareSheets } from '../googleSheets.js'
import '../googleSheetConnection.css'

const CONNECTION_META_KEY = 'petcare.google-sheet.v1'

export default function GoogleSheetConnection({ onConnected, onProvisionLine, lineUserId = '', connection: connectedConnection = null, syncStatus = 'idle', syncError = '', externalError = '', ariaLabel = 'Google Sheet connection', initialConsentAccepted = false, showConsent = true, buttonLabel = 'เชื่อมต่อ Google' }) {
  const [connection, setConnection] = useState(connectedConnection)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [consentAccepted, setConsentAccepted] = useState(initialConsentAccepted)
  const [sheets, setSheets] = useState([])
  const [showSheets, setShowSheets] = useState(false)

  useEffect(() => {
    if (connectedConnection) {
      setConnection(connectedConnection)
      setConsentAccepted(true)
    }
  }, [connectedConnection])

  const getAccessAndProfile = async () => {
    const existingAccessToken = connection?.accessToken || connectedConnection?.accessToken
    const accessToken = existingAccessToken || await requestGoogleAccessToken()
    const connectedEmail = connection?.email || connectedConnection?.email
    const profile = connectedEmail && existingAccessToken ? { email: connectedEmail } : await getGoogleUserProfile(accessToken)
    if (!profile.email) throw new Error('ไม่พบอีเมลของ Google Account')
    return { accessToken, profile }
  }

  const loadSheets = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { accessToken } = await getAccessAndProfile()
      setSheets(await listPetCareSheets(accessToken))
      setShowSheets(true)
    } catch (loadError) {
      setError(loadError.message || 'โหลดรายการ Google Sheet ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const connect = async (createNew = false, selectedSpreadsheetId = '') => {
    const existingAccessToken = connection?.accessToken || connectedConnection?.accessToken
    if (!isGoogleConfigured() || (!consentAccepted && !existingAccessToken)) return
    setBusy(true)
    setError('')
    try {
      const { accessToken, profile } = await getAccessAndProfile()
      let cachedConnection = null
      try { cachedConnection = JSON.parse(window.localStorage.getItem(CONNECTION_META_KEY) || 'null') } catch { /* ignore invalid cache */ }
      const preferredSpreadsheetId = selectedSpreadsheetId || (!createNew && cachedConnection?.email === profile.email ? cachedConnection.spreadsheetId : '')
      const sheet = await createOrFindPetCareSheet(accessToken, profile.email, preferredSpreadsheetId, { createNew })
      const next = { ...sheet, email: profile.email, accessToken }
      await onConnected?.(next)
      if (lineUserId) await onProvisionLine?.(next, lineUserId)
      window.localStorage.setItem(CONNECTION_META_KEY, JSON.stringify({ email: profile.email, spreadsheetId: sheet.spreadsheetId, spreadsheetUrl: sheet.spreadsheetUrl, name: sheet.name }))
      setConnection(next)
      setShowSheets(false)
    } catch (connectError) {
      setError(connectError.message || 'เชื่อมต่อ Google Sheet ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const sheetPicker = showSheets && <div className="google-sheet-picker" aria-label="เลือก Google Sheet เดิม">
    {sheets.length ? sheets.map(sheet => <button key={sheet.spreadsheetId} type="button" className="google-sheet-option" onClick={() => connect(false, sheet.spreadsheetId)} disabled={busy}>
      <span><b>{sheet.name}</b><small>{sheet.modifiedTime ? new Date(sheet.modifiedTime).toLocaleDateString('th-TH') : 'Google Sheet'}</small></span><strong>ใช้ Sheet นี้</strong>
    </button>) : <small>ยังไม่พบ Sheet ที่ชื่อเกี่ยวกับ PetCare ใน Google Drive</small>}
  </div>

  if (!isGoogleConfigured()) return <section className="setting setting-google" aria-label={ariaLabel}><b>Google Sheet</b><small>ยังไม่ได้ตั้งค่า Google OAuth · Demo mode</small><button type="button" className="text-button" disabled>เชื่อมต่อ Google</button>{externalError && <small role="alert" className="danger">{externalError}</small>}</section>

  return <section className={`setting setting-google ${busy ? 'is-busy' : ''}`} aria-label={ariaLabel} aria-busy={busy}>
    {busy && <div className="sheet-profile-skeleton" aria-label="กำลังเชื่อมต่อ Google Sheet"><span /><div><i /><i /></div></div>}
    {connection ? <>
      <b>Google Sheet เชื่อมต่อแล้ว</b><small>{connection.email} · {connection.created ? 'สร้าง Sheet ใหม่แล้ว' : 'ใช้ Sheet เดิม'}</small>
      {syncStatus === 'pending' && <small>มีข้อมูลใหม่รอการบันทึกลง Google Sheet…</small>}{syncStatus === 'saving' && <small>กำลังบันทึกข้อมูลลง Google Sheet…</small>}{syncStatus === 'saved' && <small>บันทึกลง Google Sheet แล้ว ✓</small>}
      {syncError && <small role="alert" className="danger">บันทึกไม่สำเร็จ: {syncError}</small>}
      <a href={connection.spreadsheetUrl} target="_blank" rel="noreferrer">เปิด Google Sheet</a>
      <button type="button" className="text-button" onClick={loadSheets} disabled={busy}>เลือก Sheet เดิม</button>
      {sheetPicker}
      <button type="button" className="text-button" onClick={() => connect(true)} disabled={busy}>{busy ? 'กำลังเชื่อมต่อ…' : 'เริ่มใช้ Sheet ใหม่สำหรับ Production'}</button>
    </> : <>
      <b>ยังไม่ได้เชื่อม Google Sheet</b><small>{busy ? 'กำลังเชื่อมต่อและเตรียมข้อมูล…' : 'เชื่อมต่อเพื่อเริ่มใช้งานและบันทึกข้อมูล'}</small>
      {showConsent && <label className="google-consent"><input type="checkbox" checked={consentAccepted} disabled={busy} onChange={event => setConsentAccepted(event.target.checked)} /><span>อนุญาตให้ PetCare สร้างและบันทึกข้อมูลในไฟล์ Google Sheet ของฉัน</span></label>}
      <button type="button" className="text-button" onClick={() => connect(false)} disabled={busy || !consentAccepted}>{busy ? 'กำลังเชื่อมต่อ…' : buttonLabel}</button>
      <button type="button" className="text-button" onClick={loadSheets} disabled={busy || !consentAccepted}>เลือก Sheet ที่เคยสร้าง</button>
      {sheetPicker}
    </>}
    {(error || externalError) && <small role="alert" className="danger">{error || externalError}</small>}
  </section>
}
