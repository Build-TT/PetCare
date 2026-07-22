import { useEffect, useState } from 'react'
import { loginAccount, registerAccount, saveAccountSession } from '../accountAuth.js'
import { getGoogleUserProfile, isGoogleConfigured, loadGoogleIdentityServices, requestGoogleAccessToken } from '../googleAuth.js'
import '../accountGate.css'

export default function AccountGate({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', password: '', name: '', surname: '', email: '', invite_code: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleReady, setGoogleReady] = useState(!isGoogleConfigured())
  const [rememberMe, setRememberMe] = useState(true)
  useEffect(() => {
    if (!isGoogleConfigured()) return undefined
    let active = true
    loadGoogleIdentityServices().then(() => active && setGoogleReady(true)).catch(() => active && setGoogleReady(false))
    return () => { active = false }
  }, [])
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }))
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const session = mode === 'login' ? await loginAccount(form.username, form.password, rememberMe) : await registerAccount(form, true)
      onAuthenticated(session)
    } catch (submitError) { setError(submitError.message || 'เข้าสู่ระบบไม่สำเร็จ') }
    finally { setBusy(false) }
  }
  const googleLogin = async () => {
    setGoogleBusy(true); setError('')
    try {
      const accessToken = await requestGoogleAccessToken()
      const profile = await getGoogleUserProfile(accessToken)
      const session = { status: 'ok', session_token: 'google-session', user: { email: profile.email, name: profile.name || '', surname: '', role: 'user', spreadsheet_id: '' } }
      saveAccountSession(session, rememberMe ? window.localStorage : window.sessionStorage)
      onAuthenticated(session)
    } catch (loginError) { setError(loginError.message || 'Google Login ไม่สำเร็จ') }
    finally { setGoogleBusy(false) }
  }
  return <main className="account-gate"><section className="account-card"><div className="account-mark">P</div><p className="account-kicker">PETCARE</p><h1>{mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครบัญชี PetCare'}</h1><p className="account-copy">เข้าสู่ระบบเพื่อใช้ข้อมูลสัตว์เลี้ยงและ Google Sheet ของคุณ</p><form onSubmit={submit}>
    {mode === 'register' && <><label>ชื่อ<input name="name" required value={form.name} onChange={update} /></label><label>นามสกุล<input name="surname" required value={form.surname} onChange={update} /></label><label>อีเมล<input name="email" type="email" required value={form.email} onChange={update} /></label><label>Invite code (ถ้า Admin ส่งให้)<input name="invite_code" value={form.invite_code} onChange={update} /></label></>}
    <label>Username<input name="username" autoComplete="username" required value={form.username} onChange={update} /></label><label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={form.password} onChange={update} /></label>
    {mode === 'login' && <label className="account-remember"><input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)} /><span>จดจำการเข้าสู่ระบบบนอุปกรณ์นี้</span></label>}
    {error && <small role="alert" className="danger">{error}</small>}<button className="primary" disabled={busy}>{busy ? 'กำลังดำเนินการ…' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครบัญชี'}</button>
  </form>{mode === 'login' && <><div className="account-divider">หรือ</div><button className="account-google" type="button" onClick={googleLogin} disabled={googleBusy || !googleReady}>{googleBusy ? 'กำลังเชื่อมต่อ Google…' : !googleReady ? 'กำลังเตรียม Google…' : 'เข้าสู่ระบบด้วย Google'}</button></>}<button className="text-button" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'ยังไม่มีบัญชี? สมัครใช้งาน' : 'มีบัญชีแล้ว? เข้าสู่ระบบ'}</button></section></main>
}
