import React from 'react'
import { t, useLang } from '../i18n.js'

// nav ล่างถาวร — ใช้ full-page navigation (ไม่มี client router)
const ITEMS = [
  { page: '',     icon: '🏠', key: 'home' },
  { page: 'log',  icon: '📝', key: 'add_log' },
  { page: 'meds', icon: '💊', key: 'meds' },
  { page: 'pets', icon: '🐾', key: 'pets' },
]

export default function BottomNav() {
  const lang = useLang()
  const params = new URLSearchParams(window.location.search)
  const current = params.get('page') || ''

  const go = (page) => {
    window.location.href = page ? `/?page=${page}` : '/'
  }

  return (
    <nav style={S.nav}>
      {ITEMS.map(it => {
        const active = current === it.page
        return (
          <button
            key={it.key}
            onClick={() => go(it.page)}
            onTouchEnd={(e) => { e.preventDefault(); go(it.page) }}
            style={{ ...S.item, color: active ? '#16a34a' : '#94a3b8' }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>{it.icon}</span>
            <span style={{ fontSize: 11, marginTop: 2 }}>{t(it.key, lang)}</span>
          </button>
        )
      })}
    </nav>
  )
}

const S = {
  nav: {
    position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
    width: '100%', maxWidth: 480, height: 60,
    display: 'flex', background: '#fff', borderTop: '1px solid #e2e8f0',
    boxShadow: '0 -2px 8px rgba(0,0,0,0.04)', zIndex: 50,
  },
  item: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', background: 'none', border: 'none', padding: 0,
  },
}
