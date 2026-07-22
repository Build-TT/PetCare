import { useEffect, useState } from 'react'
import { grantSheetAccess, listSheetPermissions, revokeSheetAccess } from '../googleDrivePermissions.js'

export default function GoogleSheetMembers({ connection }) {
  const [members, setMembers] = useState([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('reader')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = async () => {
    if (!connection?.accessToken || !connection?.spreadsheetId) return
    setBusy(true); setError('')
    try { setMembers(await listSheetPermissions(connection.accessToken, connection.spreadsheetId)) }
    catch (loadError) { setError(loadError.message || 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  useEffect(() => { refresh() }, [connection?.accessToken, connection?.spreadsheetId])

  const invite = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      await grantSheetAccess(connection.accessToken, connection.spreadsheetId, email, role)
      setEmail(''); setMessage('เพิ่มสิทธิ์แล้ว ระบบจะส่งอีเมลเชิญให้ผู้ใช้')
      await refresh()
    } catch (inviteError) { setError(inviteError.message || 'เพิ่มสิทธิ์ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  const remove = async permission => {
    if (!window.confirm(`ยกเลิกสิทธิ์ ${permission.emailAddress || permission.displayName || 'ผู้ใช้นี้'} หรือไม่`)) return
    setBusy(true); setError('')
    try { await revokeSheetAccess(connection.accessToken, connection.spreadsheetId, permission.id); await refresh() }
    catch (removeError) { setError(removeError.message || 'ยกเลิกสิทธิ์ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  if (!connection?.accessToken) return <section className="settings-panel"><b>เพิ่มผู้ใช้งาน</b><small>กรุณาเชื่อมต่อ Google Sheet ใหม่ก่อนจัดการสิทธิ์</small></section>
  return <section className="settings-panel sheet-members" aria-label="ผู้ใช้ Google Sheet">
    <div className="section-title"><h3>ผู้ใช้ที่เข้าถึง Sheet</h3><button className="text-button" type="button" onClick={refresh} disabled={busy}>รีเฟรช</button></div>
    <form onSubmit={invite} className="member-invite">
      <label>อีเมลผู้ใช้ใหม่<input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="user@example.com" /></label>
      <label>สิทธิ์<select value={role} onChange={event => setRole(event.target.value)}><option value="reader">ดูข้อมูลอย่างเดียว</option><option value="writer">แก้ไขข้อมูลได้</option></select></label>
      <button className="primary" type="submit" disabled={busy}>เพิ่มสิทธิ์</button>
    </form>
    {message && <small role="status">{message}</small>}
    {error && <small role="alert" className="danger">{error}</small>}
    <div className="member-list">{members.filter(member => member.type === 'user').map(member => <div className="member-row" key={member.id}><span><b>{member.emailAddress || member.displayName || 'Google user'}</b><small>{member.role === 'writer' ? 'แก้ไขได้' : member.role === 'owner' ? 'เจ้าของ' : 'ดูได้'}</small></span>{member.role !== 'owner' && <button className="text-button danger" type="button" onClick={() => remove(member)} disabled={busy}>ลบสิทธิ์</button>}</div>)}</div>
  </section>
}
