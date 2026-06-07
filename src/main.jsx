import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AddLog from './liff/AddLog.jsx'
import ManagePets from './liff/ManagePets.jsx'
import ManageMeds from './liff/ManageMeds.jsx'
import ManageTypes from './liff/ManageTypes.jsx'
import PetDetail from './pages/PetDetail.jsx'
import BottomNav from './components/BottomNav.jsx'
import './index.css'

// routing ด้วย ?page= และรองรับ liff.state (ตอนเปิดผ่าน LINE)
function Router() {
  const params = new URLSearchParams(window.location.search)
  const liffState = decodeURIComponent(params.get('liff.state') || '')
  const qs = liffState.includes('?') ? liffState.split('?')[1] : ''
  const sp = new URLSearchParams(qs)
  const page = sp.get('page') || params.get('page')

  if (page === 'log')   return <AddLog />
  if (page === 'pets')  return <ManagePets />
  if (page === 'meds')  return <ManageMeds />
  if (page === 'types') return <ManageTypes />
  if (page === 'pet')   return <PetDetail petId={sp.get('id') || params.get('id')} />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div style={{ paddingBottom: 64 }}>
      <Router />
    </div>
    <BottomNav />
  </React.StrictMode>
)
