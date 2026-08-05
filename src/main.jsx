import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AddLog from './liff/AddLog.jsx'
import ManagePets from './liff/ManagePets.jsx'
import ManageMeds from './liff/ManageMeds.jsx'
import ManageTypes from './liff/ManageTypes.jsx'
import PetDetail from './pages/PetDetail.jsx'
import { parseRoute } from './routes.js'
import AccountGate from './components/AccountGate.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import InstallAppPrompt from './components/InstallAppPrompt.jsx'
import { clearAccountSession, getAccountSession, loadAccountProfile, saveAccountSession } from './accountAuth.js'
import { isRecoveryMode } from './sync/recoveryMode.js'
import './index.css'
import './appFeatures.css'

export { MAIN_APP_PAGES, parseRoute as resolveRoute } from './routes.js'

// Main-app pages stay inside App; LIFF tools remain explicit full-page routes.
export function Router() {
  const route = parseRoute()

  if (route.kind === 'log') return <AddLog />
  if (route.kind === 'pets') return <ManagePets />
  if (route.kind === 'meds') return <ManageMeds />
  if (route.kind === 'types') return <ManageTypes />
  if (route.kind === 'pet') return <PetDetail petId={route.petId} />
  return <MainApp initialPage={route.page} />
}

function MainApp({ initialPage }) {
  const recoveryMode = isRecoveryMode(window.location)
  const [session, setSession] = React.useState(() => getAccountSession())
  const [profileError, setProfileError] = React.useState('')
  const [profileRetry, setProfileRetry] = React.useState(0)
  React.useEffect(() => {
    if (!session?.session_token) return undefined
    let active = true
    setProfileError('')
    loadAccountProfile(session.session_token).then(user => {
      if (!active || !user) return
      const next = { ...session, user }
      setSession(next)
      const storage = window.localStorage.getItem('petcare.account-session.v1') ? window.localStorage : window.sessionStorage
      saveAccountSession(next, storage)
    }).catch(error => {
      if (!active) return
      const message = String(error?.message || '')
      if (/หมดอายุ|ไม่พบ|ถูกปิด|session/i.test(message)) {
        clearAccountSession()
        setSession(null)
      } else {
        setProfileError(message || 'โหลดบัญชี PetCare ไม่สำเร็จ')
      }
    })
    return () => { active = false }
  }, [session?.session_token, profileRetry])
  if (recoveryMode) return <App initialPage="settings" />
  // A failed profile refresh is not a failed login. Blocking the whole app on
  // it meant any backend hiccup (or being offline in an installed PWA) looked
  // like a lost session and pushed people through a full reconnect. The cached
  // session keeps working and the banner offers an explicit retry.
  return <><InstallAppPrompt />{!session?.session_token
    ? <AccountGate onAuthenticated={setSession} />
    : <>{profileError && <div className="account-offline-banner" role="status">ยังเชื่อมต่อบัญชี PetCare ไม่ได้ ({profileError}) — ใช้งานต่อได้และข้อมูลจะซิงก์เมื่อกลับมาออนไลน์<button type="button" className="text-button" onClick={() => setProfileRetry(value => value + 1)}>ลองใหม่</button></div>}
      <App key={`${session.session_token}:${session.user?.spreadsheet_id || ''}`} initialPage={initialPage} accountSession={session} role={session.user?.role} onLogout={() => { clearAccountSession(); window.location.reload() }} /></>}</>
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div style={{ paddingBottom: 64 }}>
      <ErrorBoundary>
        <Router />
      </ErrorBoundary>
    </div>
  </React.StrictMode>
)

// An installed PWA is often resumed rather than relaunched, so it can keep
// running a build for days. Ask for a fresh service worker on every load and
// reload once the new one takes over — `controllerchange` also fires on the
// very first install, which must not trigger a reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller)
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return
      reloading = true
      window.location.reload()
    })
    navigator.serviceWorker.register('/sw.js').then(registration => registration.update()).catch(() => undefined)
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    navigator.serviceWorker.getRegistration().then(registration => registration?.update()).catch(() => undefined)
  })
}
