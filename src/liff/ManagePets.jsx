import React, { useEffect, useState } from 'react'
import { fetchSheet, sendToGAS, initLiff, genId } from './utils.js'
import { bustCache } from '../cache.js'
import { t, useLang } from '../i18n.js'
import { S, tap, PET_COLORS } from '../ui.js'
import LangToggle from '../components/LangToggle.jsx'
import GoogleSheetLink from './GoogleSheetLink.jsx'

const SPECIES = [
  { key: 'dog', icon: '🐶' },
  { key: 'cat', icon: '🐱' },
  { key: 'other_pet', icon: '🐾' },
]

const EMPTY = { id: '', name: '', species: 'dog', breed: '', birthdate: '', color: '' }

export default function ManagePets() {
  const lang = useLang()
  const [pets, setPets] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null) // null = ไม่เปิดฟอร์ม
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    ;(async () => {
      try { await initLiff('pets'); await load() } catch (e) { setLoadError(e.message || t('error', lang)); setLoading(false) }
    })()
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const rows = await fetchSheet('pets')
      setPets(rows.filter(p => String(p.active).toUpperCase() !== 'FALSE'))
    } catch (e) {
      setLoadError(e.message || t('error', lang))
    }
    setLoading(false)
  }

  function openNew() {
    setForm({ ...EMPTY, color: PET_COLORS[pets.length % PET_COLORS.length] })
  }

  async function save() {
    if (!form.name.trim() || busy) return
    setBusy(true)
    setActionError('')
    try {
      const isNew = !form.id
      const payload = {
        action: isNew ? 'addPet' : 'editPet',
        id: form.id || genId('pet'),
        name: form.name.trim(),
        species: form.species,
        breed: form.breed.trim(),
        birthdate: form.birthdate,
        color: form.color,
        order: isNew ? pets.length + 1 : undefined,
      }
      await sendToGAS(payload)
      bustCache('dash')
      setToast(t('saved', lang))
      setForm(null)
      await load()
    } catch (e) {
      setActionError(e.message || t('error', lang))
    }
    setBusy(false)
  }

  async function remove(p) {
    if (!confirm(t('confirm_delete', lang) + ' ' + p.name)) return
    setBusy(true)
    try {
      await sendToGAS({ action: 'deletePet', id: p.id })
      bustCache('dash')
      await load()
    } catch (e) { setToast(t('error', lang)) }
    setBusy(false)
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>🐾 {t('pets', lang)}</h1>
        <LangToggle />
      </div>
      <GoogleSheetLink pageKey="pets" onLinked={load} />

      {loading ? (
        <p style={S.muted}>{t('loading', lang)}</p>
      ) : loadError ? (
        <div role="alert" style={S.danger}>
          <p>{loadError}</p>
          <button style={S.ghost} {...tap(load)}>Retry</button>
        </div>
      ) : (
        <>
          {pets.length === 0 && !form && <p style={S.muted}>{t('no_pets', lang)}</p>}

          {pets.map(p => {
            const sp = SPECIES.find(s => s.key === p.species) || SPECIES[2]
            return (
              <div key={p.id} style={S.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: (p.color || '#16a34a') + '22', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 24,
                  }}>{sp.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                    <div style={S.muted}>
                      {t(p.species, lang)}{p.breed ? ` · ${p.breed}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ ...S.row, marginTop: 10 }}>
                  <button style={S.ghost} {...tap(() => setForm({
                    id: p.id, name: p.name, species: p.species || 'dog',
                    breed: p.breed || '', birthdate: p.birthdate || '', color: p.color || '',
                  }))}>{t('edit', lang)}</button>
                  <button style={S.danger} {...tap(() => remove(p))}>{t('delete', lang)}</button>
                </div>
              </div>
            )
          })}

          {actionError && <div role="alert" style={S.danger}><p>{actionError}</p><button style={S.ghost} {...tap(save)}>Retry</button></div>}
          {form ? (
            <div style={{ ...S.card, border: '2px solid #bbf7d0' }}>
              <label style={S.label}>{t('pet_name', lang)}</label>
              <input style={S.input} value={form.name} autoFocus
                onChange={e => setForm({ ...form, name: e.target.value })} />

              <label style={S.label}>{t('species', lang)}</label>
              <div style={S.row}>
                {SPECIES.map(s => (
                  <button key={s.key} style={S.chip(form.species === s.key)}
                    {...tap(() => setForm({ ...form, species: s.key }))}>
                    {s.icon} {t(s.key, lang)}
                  </button>
                ))}
              </div>

              <label style={S.label}>{t('breed', lang)} {t('optional', lang)}</label>
              <input style={S.input} value={form.breed}
                onChange={e => setForm({ ...form, breed: e.target.value })} />

              <label style={S.label}>{t('birthdate', lang)} {t('optional', lang)}</label>
              <input style={S.input} type="date" value={form.birthdate}
                onChange={e => setForm({ ...form, birthdate: e.target.value })} />

              <button style={S.primary} disabled={busy} {...tap(save)}>
                {busy ? t('saving', lang) : t('save', lang)}
              </button>
              <button style={{ ...S.ghost, width: '100%', marginTop: 8 }}
                {...tap(() => setForm(null))}>{t('cancel', lang)}</button>
            </div>
          ) : (
            <button style={S.primary} {...tap(openNew)}>+ {t('add_pet', lang)}</button>
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
