import React, { useEffect, useState } from 'react'
import { fetchSheet, sendToGAS, initLiff, nowLocalISO } from './utils.js'
import { bustCache } from '../cache.js'
import { t, useLang } from '../i18n.js'
import { S, tap, PET_COLORS } from '../ui.js'
import LangToggle from '../components/LangToggle.jsx'

// ใช้เมื่อชีต log_types ยังว่าง (ยังไม่ seed)
const FALLBACK_TYPES = [
  { key: 'pee', icon: '💧', needs_detail: 'FALSE' },
  { key: 'poop', icon: '💩', needs_detail: 'FALSE' },
  { key: 'vaccine', icon: '💉', needs_detail: 'TRUE' },
  { key: 'checkup', icon: '🩺', needs_detail: 'TRUE' },
  { key: 'symptom', icon: '🤒', needs_detail: 'TRUE' },
  { key: 'med', icon: '💊', needs_detail: 'FALSE' },
]

export default function AddLog() {
  const lang = useLang()
  const [pets, setPets] = useState([])
  const [types, setTypes] = useState([])
  const [petId, setPetId] = useState('')
  const [type, setType] = useState('')
  const [datetime, setDatetime] = useState(nowLocalISO())
  const [detail, setDetail] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { initLiff('log'); load() }, [])

  // อ่าน ?pet= และ ?type= จาก url (มาจากปุ่ม quick-log บน dashboard)
  function presetFromUrl(petsList, typeList) {
    const params = new URLSearchParams(window.location.search)
    const liffState = decodeURIComponent(params.get('liff.state') || '')
    const sp = new URLSearchParams(liffState.includes('?') ? liffState.split('?')[1] : '')
    const pPet = sp.get('pet') || params.get('pet')
    const pType = sp.get('type') || params.get('type')
    if (pPet && petsList.some(p => p.id === pPet)) setPetId(pPet)
    if (pType && typeList.some(tp => tp.key === pType)) setType(pType)
  }

  async function load() {
    setLoading(true)
    try {
      const [petRows, typeRows] = await Promise.all([
        fetchSheet('pets'),
        fetchSheet('log_types').catch(() => []),
      ])
      const activePets = petRows.filter(p => String(p.active).toUpperCase() !== 'FALSE')
      let activeTypes = typeRows
        .filter(r => String(r.active).toUpperCase() !== 'FALSE')
        .sort((a, b) => (+a.order || 0) - (+b.order || 0))
      if (activeTypes.length === 0) activeTypes = FALLBACK_TYPES
      setPets(activePets)
      setTypes(activeTypes)
      if (activePets.length === 1) setPetId(activePets[0].id)
      presetFromUrl(activePets, activeTypes)
    } catch (e) {
      setToast(t('error', lang))
    }
    setLoading(false)
  }

  function typeLabel(tp) {
    if (lang === 'en' && tp.label_en) return tp.label_en
    if (lang === 'th' && tp.label_th) return tp.label_th
    return t('type_' + tp.key, lang) // fallback ไป i18n
  }

  async function save() {
    if (!petId || !type || busy) return
    setBusy(true)
    try {
      await sendToGAS({
        action: 'addLog',
        pet_id: petId,
        type,
        datetime,
        detail: detail.trim(),
      })
      bustCache('dash', 'logs_' + petId)
      setToast(t('saved', lang))
      // reset เฉพาะ detail + เวลา ให้บันทึกต่อเนื่องได้
      setDetail('')
      setDatetime(nowLocalISO())
    } catch (e) {
      setToast(t('error', lang))
    }
    setBusy(false)
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>📝 {t('add_log', lang)}</h1>
        <LangToggle />
      </div>

      {loading ? (
        <p style={S.muted}>{t('loading', lang)}</p>
      ) : pets.length === 0 ? (
        <div style={S.card}>
          <p style={S.muted}>{t('no_pets', lang)}</p>
          <button style={S.primary} {...tap(() => { window.location.href = '/?page=pets' })}>
            + {t('add_pet', lang)}
          </button>
        </div>
      ) : (
        <>
          <label style={S.label}>{t('choose_pet', lang)}</label>
          <div style={S.row}>
            {pets.map((p, i) => (
              <button key={p.id} style={S.chip(petId === p.id)}
                {...tap(() => setPetId(p.id))}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: p.color || PET_COLORS[i % PET_COLORS.length], marginRight: 6,
                }} />
                {p.name}
              </button>
            ))}
          </div>

          <label style={S.label}>{t('log_type', lang)}</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {types.map(tp => (
              <button key={tp.key}
                style={{
                  ...S.chip(type === tp.key),
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 4, padding: '12px 6px',
                }}
                {...tap(() => setType(tp.key))}>
                <span style={{ fontSize: 24 }}>{tp.icon || '•'}</span>
                <span style={{ fontSize: 13 }}>{typeLabel(tp)}</span>
              </button>
            ))}
          </div>

          <label style={S.label}>{t('datetime', lang)}</label>
          <input style={S.input} type="datetime-local" value={datetime}
            onChange={e => setDatetime(e.target.value)} />

          <label style={S.label}>{t('detail', lang)} {t('optional', lang)}</label>
          <textarea style={S.textarea} value={detail} placeholder={t('detail_ph', lang)}
            onChange={e => setDetail(e.target.value)} />

          <button style={{ ...S.primary, opacity: (!petId || !type) ? 0.5 : 1 }}
            disabled={busy || !petId || !type} {...tap(save)}>
            {busy ? t('saving', lang) : t('save', lang)}
          </button>
        </>
      )}

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  )
}

function Toast({ msg, onDone }) {
  useEffect(() => { const id = setTimeout(onDone, 2000); return () => clearTimeout(id) }, [])
  return <div style={S.toast}>{msg}</div>
}
