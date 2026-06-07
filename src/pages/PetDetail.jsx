import React, { useEffect, useState } from 'react'
import { fetchSheet, sendToGAS, fmtDateTime } from '../liff/utils.js'
import { bustCache } from '../cache.js'
import { t, useLang } from '../i18n.js'
import { S, tap } from '../ui.js'
import LangToggle from '../components/LangToggle.jsx'

// timeline ประวัติรายตัว + กรองตามประเภท
export default function PetDetail({ petId }) {
  const lang = useLang()
  const [pet, setPet] = useState(null)
  const [logs, setLogs] = useState([])
  const [types, setTypes] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [petRows, logRows, typeRows] = await Promise.all([
        fetchSheet('pets'),
        fetchSheet('logs').catch(() => []),
        fetchSheet('log_types').catch(() => []),
      ])
      setPet(petRows.find(p => p.id === petId) || null)
      setLogs(logRows.filter(l => l.pet_id === petId)
        .sort((a, b) => String(b.datetime).localeCompare(String(a.datetime))))
      setTypes(typeRows.sort((a, b) => (+a.order || 0) - (+b.order || 0)))
    } catch (e) { /* เงียบไว้ */ }
    setLoading(false)
  }

  const typeMeta = (key) => types.find(tp => tp.key === key) || {}
  function typeLabel(key) {
    const tp = typeMeta(key)
    if (lang === 'en' && tp.label_en) return tp.label_en
    if (lang === 'th' && tp.label_th) return tp.label_th
    return t('type_' + key, lang)
  }
  function typeIcon(key) {
    return typeMeta(key).icon || ({ pee: '💧', poop: '💩', med: '💊', vaccine: '💉', checkup: '🩺', symptom: '🤒' }[key]) || '🐾'
  }

  async function del(l) {
    if (!confirm(t('confirm_delete', lang))) return
    try {
      await sendToGAS({ action: 'deleteLog', id: l.id })
      bustCache('dash')
      await load()
    } catch (e) { /* */ }
  }

  const shown = filter ? logs.filter(l => l.type === filter) : logs
  // ประเภทที่ปรากฏจริงในประวัติ (ไว้ทำปุ่มกรอง)
  const usedTypes = [...new Set(logs.map(l => l.type))]

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button style={S.ghost} {...tap(() => { window.location.href = '/' })}>‹ {t('back', lang)}</button>
        <LangToggle />
      </div>

      {loading ? (
        <p style={S.muted}>{t('loading', lang)}</p>
      ) : !pet ? (
        <p style={S.muted}>{t('none', lang)}</p>
      ) : (
        <>
          <h1 style={{ ...S.title, marginBottom: 4 }}>
            {pet.species === 'cat' ? '🐱' : pet.species === 'dog' ? '🐶' : '🐾'} {pet.name}
          </h1>
          <div style={{ ...S.muted, marginBottom: 12 }}>
            {t(pet.species, lang)}{pet.breed ? ` · ${pet.breed}` : ''}
            {pet.birthdate ? ` · ${t('birthdate', lang)} ${fmtDateTime(pet.birthdate, lang)}` : ''}
          </div>

          <button style={{ ...S.primary, marginTop: 0, marginBottom: 14 }}
            {...tap(() => { window.location.href = `/?page=log&pet=${pet.id}` })}>
            + {t('add_log', lang)}
          </button>

          {/* ปุ่มกรอง */}
          <div style={{ ...S.row, marginBottom: 12 }}>
            <button style={S.chip(filter === '')} {...tap(() => setFilter(''))}>{t('all', lang)}</button>
            {usedTypes.map(k => (
              <button key={k} style={S.chip(filter === k)} {...tap(() => setFilter(k))}>
                {typeIcon(k)} {typeLabel(k)}
              </button>
            ))}
          </div>

          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 8px' }}>{t('history', lang)}</h2>
          {shown.length === 0 && <p style={S.muted}>{t('none', lang)}</p>}
          {shown.map((l, i) => (
            <div key={i} style={{ ...S.card, padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 22 }}>{typeIcon(l.type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{typeLabel(l.type)}</div>
                <div style={{ ...S.muted, fontSize: 12 }}>{fmtDateTime(l.datetime, lang)}</div>
                {l.detail && <div style={{ fontSize: 14, marginTop: 4 }}>{l.detail}</div>}
              </div>
              {l.id && <button style={{ ...S.danger, padding: '4px 8px', fontSize: 12 }}
                {...tap(() => del(l))}>✕</button>}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
