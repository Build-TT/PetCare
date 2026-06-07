import React, { useEffect, useState } from 'react'
import { fetchSheet, todayISO, fmtDateTime } from './liff/utils.js'
import { getCache, setCache, bustCache } from './cache.js'
import { t, useLang } from './i18n.js'
import { S, tap, PET_COLORS } from './ui.js'
import { isScheduledOn } from './schedule.js'
import LangToggle from './components/LangToggle.jsx'

// ปุ่มบันทึกเร็วบนการ์ดสัตว์เลี้ยง
const QUICK = [
  { type: 'pee', icon: '💧' },
  { type: 'poop', icon: '💩' },
  { type: 'symptom', icon: '🤒' },
]

export default function App() {
  const lang = useLang()
  const [pets, setPets] = useState([])
  const [logs, setLogs] = useState([])
  const [scheds, setScheds] = useState([])
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    load()
    // reload เมื่อกลับมาที่แท็บ (เหมือนระบบเดิม)
    const onVis = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  async function load(force) {
    setLoading(true)
    setErr('')
    try {
      if (force) bustCache('dash')
      let cached = getCache('dash')
      if (!cached) {
        const [p, l, s, tp] = await Promise.all([
          fetchSheet('pets'),
          fetchSheet('logs').catch(() => []),
          fetchSheet('med_schedules').catch(() => []),
          fetchSheet('log_types').catch(() => []),
        ])
        cached = { p, l, s, tp }
        setCache('dash', cached)
      }
      setPets(cached.p.filter(x => String(x.active).toUpperCase() !== 'FALSE'))
      setLogs(cached.l)
      setScheds(cached.s
        .filter(x => String(x.active).toUpperCase() !== 'FALSE')
        .map(x => ({ ...x, config: parseCfg(x.config) })))
      setTypes(cached.tp)
    } catch (e) {
      setErr(t('error', lang))
    }
    setLoading(false)
  }

  const petById = (id) => pets.find(p => p.id === id)
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

  const today = todayISO()
  const dueToday = scheds.filter(s => isScheduledOn(s, today))
  const recentLogs = [...logs]
    .sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)))
    .slice(0, 12)

  const go = (url) => { window.location.href = url }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>🐾 {t('app_name', lang)}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.ghost} {...tap(() => load(true))}>↻</button>
          <LangToggle />
        </div>
      </div>

      {loading && <p style={S.muted}>{t('loading', lang)}</p>}
      {err && <p style={{ color: '#dc2626' }}>{err}</p>}

      {!loading && pets.length === 0 && (
        <div style={S.card}>
          <p style={S.muted}>{t('no_pets', lang)}</p>
          <button style={S.primary} {...tap(() => go('/?page=pets'))}>+ {t('add_pet', lang)}</button>
        </div>
      )}

      {/* แจ้งเตือนยาวันนี้ */}
      {dueToday.length > 0 && (
        <div style={{ ...S.card, background: '#fff7ed', border: '1px solid #fed7aa' }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: '#c2410c' }}>
            💊 {t('due_today', lang)}
          </div>
          {dueToday.map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{(petById(s.pet_id) || {}).name} · {s.med_name}{s.dose ? ` (${s.dose})` : ''}</span>
              <span style={S.muted}>{s.time}</span>
            </div>
          ))}
          <button style={{ ...S.ghost, marginTop: 8 }} {...tap(() => go('/?page=meds'))}>
            {t('meds', lang)} →
          </button>
        </div>
      )}

      {/* การ์ดสัตว์เลี้ยง + quick log */}
      {pets.map((p, i) => {
        const color = p.color || PET_COLORS[i % PET_COLORS.length]
        const last = logs
          .filter(l => l.pet_id === p.id)
          .sort((a, b) => String(b.datetime).localeCompare(String(a.datetime)))[0]
        return (
          <div key={p.id} style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}
              {...tap(() => go(`/?page=pet&id=${p.id}`))}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                background: color + '22', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 24,
              }}>{p.species === 'cat' ? '🐱' : p.species === 'dog' ? '🐶' : '🐾'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                <div style={S.muted}>
                  {last ? `${typeIcon(last.type)} ${typeLabel(last.type)} · ${fmtDateTime(last.datetime, lang)}` : t('none', lang)}
                </div>
              </div>
              <span style={{ color: '#cbd5e1' }}>›</span>
            </div>
            <div style={{ ...S.row, marginTop: 10 }}>
              {QUICK.map(q => (
                <button key={q.type} style={S.chip(false)}
                  {...tap(() => go(`/?page=log&pet=${p.id}&type=${q.type}`))}>
                  {q.icon} {typeLabel(q.type)}
                </button>
              ))}
            </div>
          </div>
        )
      })}

      {/* บันทึกล่าสุดรวม */}
      {recentLogs.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '18px 0 8px' }}>
            {t('recent_logs', lang)}
          </h2>
          {recentLogs.map((l, idx) => (
            <div key={idx} style={{ ...S.card, padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 22 }}>{typeIcon(l.type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {(petById(l.pet_id) || {}).name || '—'} · {typeLabel(l.type)}
                </div>
                {l.detail && <div style={{ ...S.muted, fontSize: 13 }}>{l.detail}</div>}
              </div>
              <div style={{ ...S.muted, fontSize: 12, textAlign: 'right' }}>
                {fmtDateTime(l.datetime, lang)}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function parseCfg(c) {
  if (!c) return {}
  if (typeof c === 'object') return c
  try { return JSON.parse(c) } catch { return {} }
}
