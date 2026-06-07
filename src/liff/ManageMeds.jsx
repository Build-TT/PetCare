import React, { useEffect, useState } from 'react'
import { fetchSheet, sendToGAS, initLiff, todayISO, fmtDateTime } from './utils.js'
import { bustCache } from '../cache.js'
import { t, useLang } from '../i18n.js'
import { S, tap } from '../ui.js'
import { SCHEDULE_TYPES, describeSchedule, computeNextDue, isScheduledOn } from '../schedule.js'
import LangToggle from '../components/LangToggle.jsx'

const EMPTY = {
  id: '', pet_id: '', med_name: '', dose: '',
  schedule_type: 'daily', config: {}, time: '08:00', start_date: todayISO(),
}

export default function ManageMeds() {
  const lang = useLang()
  const [pets, setPets] = useState([])
  const [scheds, setScheds] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { initLiff('meds'); load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [petRows, schedRows] = await Promise.all([
        fetchSheet('pets'),
        fetchSheet('med_schedules').catch(() => []),
      ])
      setPets(petRows.filter(p => String(p.active).toUpperCase() !== 'FALSE'))
      setScheds(schedRows
        .filter(s => String(s.active).toUpperCase() !== 'FALSE')
        .map(s => ({ ...s, config: parseCfg(s.config) })))
    } catch (e) { setToast(t('error', lang)) }
    setLoading(false)
  }

  const petName = (id) => (pets.find(p => p.id === id) || {}).name || '—'

  function openNew() {
    setForm({ ...EMPTY, pet_id: pets[0] ? pets[0].id : '', config: {} })
  }

  async function save() {
    if (!form.pet_id || !form.med_name.trim() || busy) return
    setBusy(true)
    try {
      const isNew = !form.id
      await sendToGAS({
        action: isNew ? 'addSchedule' : 'editSchedule',
        id: form.id || '',
        pet_id: form.pet_id,
        med_name: form.med_name.trim(),
        dose: form.dose.trim(),
        schedule_type: form.schedule_type,
        config: JSON.stringify(form.config || {}),
        time: form.time,
        start_date: form.start_date,
      })
      bustCache('dash')
      setToast(t('saved', lang))
      setForm(null)
      await load()
    } catch (e) { setToast(t('error', lang)) }
    setBusy(false)
  }

  async function markTaken(s) {
    setBusy(true)
    try {
      await sendToGAS({ action: 'markMedTaken', id: s.id })
      bustCache('dash', 'logs_' + s.pet_id)
      setToast(t('saved', lang))
      await load()
    } catch (e) { setToast(t('error', lang)) }
    setBusy(false)
  }

  async function remove(s) {
    if (!confirm(t('confirm_delete', lang) + ' ' + s.med_name)) return
    setBusy(true)
    try {
      await sendToGAS({ action: 'deleteSchedule', id: s.id })
      bustCache('dash')
      await load()
    } catch (e) { setToast(t('error', lang)) }
    setBusy(false)
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>💊 {t('meds', lang)}</h1>
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
          {scheds.length === 0 && !form && <p style={S.muted}>{t('no_meds', lang)}</p>}

          {scheds.map(s => {
            const due = isScheduledOn(s, todayISO())
            return (
              <div key={s.id} style={{ ...S.card, border: due ? '2px solid #fca5a5' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                      💊 {s.med_name}{s.dose ? <span style={S.muted}> · {s.dose}</span> : null}
                    </div>
                    <div style={S.muted}>{petName(s.pet_id)}</div>
                    <div style={{ ...S.muted, marginTop: 4 }}>{describeSchedule(s, lang)}</div>
                    <div style={{ fontSize: 13, color: '#16a34a', marginTop: 2 }}>
                      {t('next_due', lang)}: {s.next_due || computeNextDue(s, todayISO()) || '—'}
                    </div>
                  </div>
                  {due && <span style={{
                    alignSelf: 'flex-start', background: '#fee2e2', color: '#dc2626',
                    fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                  }}>{t('due_today', lang)}</span>}
                </div>
                <div style={{ ...S.row, marginTop: 10 }}>
                  <button style={{ ...S.ghost, background: '#dcfce7', borderColor: '#86efac', color: '#166534' }}
                    {...tap(() => markTaken(s))}>✓ {t('taken', lang)}</button>
                  <button style={S.ghost} {...tap(() => setForm({ ...s }))}>{t('edit', lang)}</button>
                  <button style={S.danger} {...tap(() => remove(s))}>{t('delete', lang)}</button>
                </div>
              </div>
            )
          })}

          {form ? (
            <ScheduleForm form={form} setForm={setForm} pets={pets} lang={lang}
              busy={busy} onSave={save} onCancel={() => setForm(null)} />
          ) : (
            <button style={S.primary} {...tap(openNew)}>+ {t('add_med', lang)}</button>
          )}

          <p style={{ ...S.muted, textAlign: 'center', marginTop: 16, fontSize: 12 }}>
            🔔 {t('reminder_note', lang)}
          </p>
        </>
      )}

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  )
}

function ScheduleForm({ form, setForm, pets, lang, busy, onSave, onCancel }) {
  const cfg = form.config || {}
  const setCfg = (patch) => setForm({ ...form, config: { ...cfg, ...patch } })

  return (
    <div style={{ ...S.card, border: '2px solid #bbf7d0' }}>
      <label style={S.label}>{t('choose_pet', lang)}</label>
      <div style={S.row}>
        {pets.map(p => (
          <button key={p.id} style={S.chip(form.pet_id === p.id)}
            {...tap(() => setForm({ ...form, pet_id: p.id }))}>{p.name}</button>
        ))}
      </div>

      <label style={S.label}>{t('med_name', lang)}</label>
      <input style={S.input} value={form.med_name} autoFocus
        onChange={e => setForm({ ...form, med_name: e.target.value })} />

      <label style={S.label}>{t('dose', lang)} {t('optional', lang)}</label>
      <input style={S.input} value={form.dose}
        onChange={e => setForm({ ...form, dose: e.target.value })} />

      <label style={S.label}>{t('schedule', lang)}</label>
      <div style={S.row}>
        {SCHEDULE_TYPES.map(st => (
          <button key={st} style={S.chip(form.schedule_type === st)}
            {...tap(() => setForm({ ...form, schedule_type: st, config: {} }))}>
            {t('sched_' + st, lang)}
          </button>
        ))}
      </div>

      {/* ฟิลด์ config ตามชนิดรอบ */}
      {form.schedule_type === 'monthly' && (
        <>
          <label style={S.label}>{t('day_of_month', lang)} (1–31)</label>
          <input style={S.input} type="number" min="1" max="31" value={cfg.day || ''}
            onChange={e => setCfg({ day: e.target.value })} />
        </>
      )}
      {form.schedule_type === 'every_n_months' && (
        <>
          <label style={S.label}>{t('every_months', lang)}</label>
          <input style={S.input} type="number" min="1" value={cfg.months || ''}
            onChange={e => setCfg({ months: e.target.value })} />
          <label style={S.label}>{t('day_of_month', lang)} (1–31)</label>
          <input style={S.input} type="number" min="1" max="31" value={cfg.day || ''}
            onChange={e => setCfg({ day: e.target.value })} />
        </>
      )}
      {form.schedule_type === 'cycle' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>{t('days_on', lang)}</label>
            <input style={S.input} type="number" min="1" value={cfg.on || ''}
              onChange={e => setCfg({ on: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>{t('days_off', lang)}</label>
            <input style={S.input} type="number" min="0" value={cfg.off || ''}
              onChange={e => setCfg({ off: e.target.value })} />
          </div>
        </div>
      )}

      <label style={S.label}>{t('remind_time', lang)}</label>
      <input style={S.input} type="time" value={form.time}
        onChange={e => setForm({ ...form, time: e.target.value })} />

      <label style={S.label}>{t('start_date', lang)}</label>
      <input style={S.input} type="date" value={form.start_date}
        onChange={e => setForm({ ...form, start_date: e.target.value })} />

      <button style={S.primary} disabled={busy} {...tap(onSave)}>
        {busy ? t('saving', lang) : t('save', lang)}
      </button>
      <button style={{ ...S.ghost, width: '100%', marginTop: 8 }} {...tap(onCancel)}>
        {t('cancel', lang)}
      </button>
    </div>
  )
}

function parseCfg(c) {
  if (!c) return {}
  if (typeof c === 'object') return c
  try { return JSON.parse(c) } catch { return {} }
}

function Toast({ msg, onDone }) {
  useEffect(() => { const id = setTimeout(onDone, 2000); return () => clearTimeout(id) }, [])
  return <div style={S.toast}>{msg}</div>
}
