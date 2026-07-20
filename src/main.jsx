import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AddLog from './liff/AddLog.jsx'
import ManagePets from './liff/ManagePets.jsx'
import ManageMeds from './liff/ManageMeds.jsx'
import ManageTypes from './liff/ManageTypes.jsx'
import PetDetail from './pages/PetDetail.jsx'
import { parseRoute } from './routes.js'
import './index.css'

export { MAIN_APP_PAGES, parseRoute as resolveRoute } from './routes.js'

// Main-app pages stay inside App; LIFF tools remain explicit full-page routes.
export function Router() {
  const route = parseRoute()

  if (route.kind === 'log') return <AddLog />
  if (route.kind === 'pets') return <ManagePets />
  if (route.kind === 'meds') return <ManageMeds />
  if (route.kind === 'types') return <ManageTypes />
  if (route.kind === 'pet') return <PetDetail petId={route.petId} />
  return <App initialPage={route.page} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div style={{ paddingBottom: 64 }}>
      <Router />
    </div>
  </React.StrictMode>
)
