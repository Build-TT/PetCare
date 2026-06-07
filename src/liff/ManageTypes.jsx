import React, { useEffect, useState } from 'react'
import { fetchSheet, sendToGAS, initLiff } from './utils.js'
import { bustCache } from '../cache.js'
import { t, useLang } from '../i18n.js'
import { S, tap } from '../ui.js'
import LangToggle from '../components/LangToggle.jsx'

// หน้าเพิ่มประเภทบันทึกเอง เช่น "อาเจียน 🤮", "น้ำหนัก ⚖️"
const EMPTY = { key: '', label_th: '', label_en: '', icon: '', needs_detail: 'FALSE' }

export default function ManageTypes() {
  const lang = useLang()
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { initLiff('types'); load() }, [])

  async function load() {
    setLoading(true)
    try {
      const rows = await fetchSheet('log_types').catch(() => [])
      setTypes(rows
        .filter(r => String(r.active).toUpperCase() !== 'FALSE')
        .sort((a, b) => (+a.order || 0) - (+b.order || 0)))
    } catch (e) { setToast(t('error', lang)) }
    setLoading(false)
  }

  async function save() {
    const label = form.label_th.trim() || form.label_en.trim()
    if (!label || busy) return
    setBusy(true)
    try {
      // สร้าง key อัตโนมัติจาก timestamp ถ้าเป็นรายการใหม่
      const key = form.key || 'custom_' + Date.now().toString(36)
      await sendToGAS({
        action: form.key ? 'editLogType' : 'addLogType',
        key,
        label_th: form.label_th.trim() || label,
        label_en: form.label_en.trim() || label,
        icon: form.icon.trim() || '🐾',
        needs_detail: form.needs_detail,
        order: form.order || types.length + 1,
      })
      bustCache('dash')
      setToast(t('saved', lang))
      setForm(null)
      await load()
    } catch (e) { setToast(t('error', lang)) }
    setBusy(false)
  }

  async function remove(tp) {
    if (!confirm(t('confirm_delete', lang))) return
    setBusy(true)
    try {
      await sendToGAS({ action: 'editLogType', key: tp.key, active: 'FALSE' })
      bustCache('dash')
      await load()
    } catch (e) { setToast(t('error', lang)) }
    setBusy(false)
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>🏷️ {t('log_type', lang)}</h1>
        <LangToggle />
      </div>

      {loading ? (
        <p style={S.muted}>{t('loading', lang)}</p>
      ) : (
        <>
          {types.map(tp => (
            <div key={tp.key} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 26 }}>{tp.icon || '🐾'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>
                  {lang === 'en' ? (tp.label_en || tp.label_th) : (tp.label_th || tp.label_en)}
                </div>
                <div style={{ ...S.muted, fontSize: 12 }}>{tp.key}</div>
              </div>
              <button style={S.ghost} {...tap(() => setForm({ ...EMPTY, ...tp }))}>{t('edit', lang)}</button>
              <button style={S.danger} {...tap(() => remove(tp))}>{t('delete', lang)}</button>
            </div>
          ))}

          {form ? (
            <div style={{ ...S.card, border: '2px solid #bbf7d0' }}>
              <label style={S.label}>Icon (emoji)</label>
              <input style={S.input} value={form.icon} placeholder="🤮"
                onChange={e => setForm({ ...form, icon: e.target.value })} />
              <label style={S.label}>ชื่อ (ไทย)</label>
              <input style={S.input} value={form.label_th}
                onChange={e => setForm({ ...form, label_th: e.target.value })} />
              <label style={S.label}>Name (English)</label>
              <input style={S.input} value={form.label_en}
                onChange={e => setForm({ ...form, label_en: e.target.value })} />
              <button style={S.primary} disabled={busy} {...tap(save)}>
                {busy ? t('saving', lang) : t('save', lang)}
              </button>
              <button style={{ ...S.ghost, width: '100%', marginTop: 8 }}
                {...tap(() => setForm(null))}>{t('cancel', lang)}</button>
            </div>
          ) : (
            <button style={S.primary} {...tap(() => setForm({ ...EMPTY }))}>
              + {t('add', lang)}
            </button>
          )}
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
