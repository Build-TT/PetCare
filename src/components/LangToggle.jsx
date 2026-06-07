import React from 'react'
import { getLang, setLang, useLang } from '../i18n.js'

export default function LangToggle() {
  const lang = useLang()
  const toggle = () => setLang(getLang() === 'th' ? 'en' : 'th')
  return (
    <button
      onClick={toggle}
      onTouchEnd={(e) => { e.preventDefault(); toggle() }}
      style={S.btn}
    >
      {lang === 'th' ? '🇹🇭 TH' : '🇬🇧 EN'}
    </button>
  )
}

const S = {
  btn: {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
    padding: '6px 10px', fontSize: 13, color: '#475569',
  },
}
