import { useEffect, useRef, useState } from 'react'
import { grantSheetAccess, listSheetPermissions, revokeSheetAccess } from '../googleDrivePermissions.js'
import { removeAccountAccess, cancelAccountInvite, inviteAccountUser, listAccountUsers, revokeAccountUser } from '../accountAuth.js'

export default function GoogleSheetMembers({ connection }) {
  const [members, setMembers] = useState([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('reader')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [accountMembers, setAccountMembers] = useState([])
  const preserveRefreshError = useRef(false)

  const refresh = async () => {
    if (!connection?.accessToken || !connection?.spreadsheetId) return
    const keepError = preserveRefreshError.current
    preserveRefreshError.current = false
    setBusy(true); if (!keepError) setError('')
    try {
      const [permissionsResult, accountsResult] = await Promise.allSettled([
        listSheetPermissions(connection.accessToken, connection.spreadsheetId),
        listAccountUsers(connection.accessToken, connection.spreadsheetId),
      ])
      if (permissionsResult.status === 'rejected') throw permissionsResult.reason
      setMembers(permissionsResult.value)
      if (accountsResult.status === 'rejected' && !keepError) {
        setAccountMembers([])
        setError(accountsResult.reason?.message || 'โหลดรายชื่อบัญชี PetCare ไม่สำเร็จ')
      } else if (accountsResult.status !== 'rejected') {
        setAccountMembers(accountsResult.value.members || [])
      }
    }
    catch (loadError) { setError(loadError.message || 'โหลดรายชื่อผู้ใช้ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  useEffect(() => { refresh() }, [connection?.accessToken, connection?.spreadsheetId])

  const invite = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      await grantSheetAccess(connection.accessToken, connection.spreadsheetId, email, role)
      const result = await inviteAccountUser(connection.accessToken, connection.spreadsheetId, email, role)
      setEmail(''); setInviteCode(result.invite_code || '');
      setMessage(result.existing_account
        ? result.email_sent
          ? `ผูกบัญชี PetCare กับ Sheet และส่งอีเมลแจ้งสิทธิ์แล้ว (${result.role || role})`
          : `ผูกบัญชี PetCare กับ Sheet แล้ว แต่ส่งอีเมลไม่สำเร็จ กรุณาแจ้งผู้ใช้ให้เข้าสู่ระบบด้วย Google อีเมลนี้ (${result.role || role})`
        : result.email_sent === false
        ? 'ให้สิทธิ์และผูกบัญชีแล้ว แต่ส่งอีเมลไม่สำเร็จ กรุณาส่ง Invite code ให้ผู้ใช้ด้วยตนเอง'
        : 'ให้สิทธิ์ Sheet และส่งคำเชิญ PetCare แล้ว')
      await refresh()
    } catch (inviteError) { setError(inviteError.message || 'เพิ่มสิทธิ์ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  const removeCombined = async (permission, account) => {
    if (!window.confirm(`ยกเลิกสิทธิ์ ${permission?.emailAddress || account?.email || 'ผู้ใช้นี้'} หรือไม่`)) return
    setBusy(true); setError(''); setMessage('')
    let accountFailure = null
    try {
      if (permission?.id) {
        try { await revokeSheetAccess(connection.accessToken, connection.spreadsheetId, permission.id) }
        catch (removeError) {
          if (removeError.status !== 404 && !/Permission not found/i.test(removeError.message || '')) throw removeError
        }
      }
      if (permission?.emailAddress || account?.email) {
        try { await removeAccountAccess(connection.accessToken, connection.spreadsheetId, permission?.emailAddress || account.email) } catch (removeError) { accountFailure = removeError }
      }
      else if (account?.status === 'pending') await cancelAccountInvite(connection.accessToken, connection.spreadsheetId, account.invite_code)
      else if (account?.username) await revokeAccountUser(connection.accessToken, connection.spreadsheetId, account.username)
      preserveRefreshError.current = Boolean(accountFailure)
      if (accountFailure) { setError(`ลบสิทธิ์ได้บางส่วน: ${accountFailure.message || 'PetCare access removal failed'}`); await refresh(); return }
      setMessage('ลบสิทธิ์ Google Drive และ PetCare แล้ว')
      await refresh()
    } catch (removeError) { setError(removeError.message || 'ลบสิทธิ์ไม่สำเร็จ') }
    finally { setBusy(false) }
  }

  if (!connection?.accessToken) return <section className="settings-panel"><b>เพิ่มผู้ใช้งาน</b><small>กรุณาเชื่อมต่อ Google Sheet ใหม่ก่อนจัดการสิทธิ์</small></section>
  return <section className="settings-panel sheet-members" aria-label="ผู้ใช้ Google Sheet">
    <div className="section-title"><h3>ผู้ใช้ที่เข้าถึง Sheet</h3><button className="text-button" type="button" onClick={refresh} disabled={busy}>รีเฟรช</button></div>
    <form onSubmit={invite} className="member-invite">
      <label>อีเมลผู้ใช้ใหม่<input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="user@example.com" /></label>
      <label>สิทธิ์<select value={role} onChange={event => setRole(event.target.value)}><option value="reader">ดูข้อมูลอย่างเดียว</option><option value="writer">แก้ไขข้อมูลได้</option></select></label>
      <button className="primary" type="submit" disabled={busy}>เพิ่มสิทธิ์และส่งคำเชิญ PetCare</button>
    </form>
    {inviteCode && <small role="status">Invite code: <code>{inviteCode}</code></small>}
    {message && <small role="status">{message}</small>}
    {error && <small role="alert" className="danger">{error}</small>}
    <div className="member-list petcare-member-list"><b>บัญชี PetCare ที่ได้รับสิทธิ์</b>{accountMembers.length === 0 && <small>ยังไม่มีบัญชีที่ลงทะเบียนกับ Sheet นี้</small>}{accountMembers.map(member => { const permission = members.find(item => item.type === 'user' && String(item.emailAddress || '').toLowerCase() === String(member.email || '').toLowerCase()); return <div className="member-row" key={member.username || member.email}><span><b>{member.email || member.username}</b><small>{member.status === 'pending' ? 'รอผู้ใช้สมัคร/เข้าสู่ระบบ' : member.status === 'revoked' ? 'ปิดสิทธิ์แล้ว' : `${member.role === 'reader' ? 'อ่านอย่างเดียว' : 'แก้ไขได้'}`}</small></span>{member.status !== 'revoked' && <button className="text-button danger" type="button" onClick={() => removeCombined(permission, member)} disabled={busy}>{member.status === 'pending' ? 'ยกเลิกคำเชิญ' : 'ลบสิทธิ์ทั้งหมด'}</button>}</div> })}</div>
    <div className="member-list">{members.filter(member => member.type === 'user' && !accountMembers.some(account => account.status !== 'revoked' && String(account.email || '').toLowerCase() === String(member.emailAddress || '').toLowerCase())).map(member => <div className="member-row" key={member.id}><span><b>{member.emailAddress || member.displayName || 'Google user'}</b><small>{member.role === 'writer' ? 'แก้ไขได้' : member.role === 'owner' ? 'เจ้าของ' : 'ดูได้'}</small></span>{member.role !== 'owner' && <button className="text-button danger" type="button" onClick={() => removeCombined(member, null)} disabled={busy}>ลบสิทธิ์</button>}</div>)}</div>
  </section>
}
