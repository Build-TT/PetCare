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
import InstallAppPrompt from './components/InstallAppPrompt.jsx'
import { clearAccountSession, getAccountSession } from './accountAuth.js'
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
  const [session, setSession] = React.useState(() => getAccountSession())
  return <><InstallAppPrompt />{!session?.session_token
    ? <AccountGate onAuthenticated={setSession} />
    : <App initialPage={initialPage} accountSession={session} onLogout={() => { clearAccountSession(); window.localStorage.removeItem('petcare.google-sheet.v1'); window.location.reload() }} />}</>
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div style={{ paddingBottom: 64 }}>
      <Router />
    </div>
  </React.StrictMode>
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
