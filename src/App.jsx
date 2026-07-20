import { useEffect, useMemo, useRef, useState } from 'react'
import { summarizeSymptoms } from './domain/summary.js'
import { loadStoredState, saveStoredState } from './domain/storage.js'
import SettingsSurface from './components/SettingsSurface.jsx'
import ReminderForm from './components/ReminderForm.jsx'
import GoogleDriveOnboarding from './components/GoogleDriveOnboarding.jsx'
import { hydrateRemoteState, isCurrentRemoteRevision, loadRemoteState, saveRemoteState, unwrapPendingState } from './remoteState.js'
import { provisionGoogleLineLink } from './gasProvisioning.js'
import { getGoogleUserProfile, requestGoogleAccessToken } from './googleAuth.js'
import { MAIN_APP_PAGES, mainPageFromSearch, mainPageHref } from './routes.js'
import './index.css'
import './appFeatures.css'

const nowLocal = () => {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const seedTracks = []
const seedLogs = []
const seedActivities = []
const defaultSymptoms = []
const defaultReminders = []
const defaultTreatmentHistory = []
const defaultLineRecipients = []
const defaultPets = [{ id: 'pet_default', name: 'โมจิ', species: 'dog', demo: true }]
const ACTIVITY_TYPES = ['ฉี่', 'ขี้', 'เดิน', 'น้ำหนัก', 'กินอาหาร', 'ดื่มน้ำ', 'อื่นๆ']
const TREATMENT_CATEGORIES = ['การกินยา', 'การป่วย', 'การผ่าตัด', 'อื่นๆ']
const REMINDER_FREQUENCIES = ['ครั้งเดียว', 'ทุกวัน', 'ทุกสัปดาห์', 'ทุกเดือน', 'ทุก 3 เดือน', 'ทุกปี']
const LOCAL_STATE_KEY = 'petcare.local.v1'
const REMOTE_OUTBOX_KEY = 'petcare.remote-outbox.v1'
const GOOGLE_SHEET_META_KEY = 'petcare.google-sheet.v1'
const GOOGLE_ONBOARDING_KEY = 'petcare.google-drive-onboarding.v1'
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const navItems = [
  ['home', '⌂', 'หน้าหลัก'], ['track', '🐾', 'สมุดบันทึก'], ['diary', '✎', 'ประวัติการรักษา'],
  ['reminders', '🔔', 'เตือน'], ['settings', '⚙', 'ตั้งค่า'],
]

const symptomLabel = symptom => typeof symptom === 'string' ? symptom : (symptom.label_th || symptom.label_en || '')
const symptomKey = symptom => typeof symptom === 'string' ? symptom : (symptom.id || `${symptom.pet_id || 'global'}:${symptomLabel(symptom)}`)
void REMINDER_FREQUENCIES

export function isValidCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function clampedBirthOffsetDate(birth, totalMonths) {
  const monthIndex = birth.getMonth() + totalMonths
  const year = birth.getFullYear() + Math.floor(monthIndex / 12)
  const month = ((monthIndex % 12) + 12) % 12
  const day = Math.min(birth.getDate(), new Date(year, month + 1, 0).getDate())
  return new Date(year, month, day)
}

export function calculatePetAge(birthdate, today = new Date()) {
  if (!isValidCalendarDate(birthdate)) return null
  const [year, month, day] = birthdate.split('-').map(Number)
  const birth = new Date(year, month - 1, day)
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (birth > current) return null

  let years = current.getFullYear() - birth.getFullYear()
  if (clampedBirthOffsetDate(birth, years * 12) > current) years -= 1
  let months = 0
  while (months < 11 && clampedBirthOffsetDate(birth, years * 12 + months + 1) <= current) months += 1
  const anchor = clampedBirthOffsetDate(birth, years * 12 + months)
  const days = Math.round((Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()) - Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())) / 86400000)
  return { years, months, days }
}

export function petLifeStage(age) {
  if (!age) return null
  const totalMonths = age.years * 12 + age.months
  if (totalMonths < 12) return { key: 'baby', icon: '🍼', label: 'วัยเด็ก', caption: 'ช่วงเรียนรู้โลกใบใหม่' }
  if (totalMonths < 36) return { key: 'growing', icon: '🌱', label: 'วัยกำลังโต', caption: 'สดใสและเต็มไปด้วยพลัง' }
  if (totalMonths < 96) return { key: 'adult', icon: '🐾', label: 'วัยโตเต็มวัย', caption: 'ช่วงวัยแข็งแรงและมั่นคง' }
  return { key: 'senior', icon: '♡', label: 'วัยสูงอายุ', caption: 'ดูแลใกล้ชิดเป็นพิเศษ' }
}

const padNumber = value => String(value).padStart(2, '0')
const localDateKey = date => `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`
const localMonthKey = date => `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}`

function analyticsPeriodMatches(datetime, granularity, target) {
  const date = new Date(datetime)
  if (Number.isNaN(date.valueOf())) return false
  if (granularity === 'daily') return localDateKey(date) === target
  if (granularity === 'yearly') return String(date.getFullYear()) === String(target)
  return localMonthKey(date) === target
}

function Summary({ logs, symptoms = defaultSymptoms, onEdit, onDelete, showRecords = true }) {
  const [symptom, setSymptom] = useState('ทั้งหมด')
  const now = new Date()
  const [granularity, setGranularity] = useState('daily')
  const [selectedDate, setSelectedDate] = useState(localDateKey(now))
  const [selectedMonth, setSelectedMonth] = useState(localMonthKey(now))
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const target = granularity === 'daily' ? selectedDate : granularity === 'yearly' ? selectedYear : selectedMonth
  const visible = logs.filter(log => {
    const labels = Array.isArray(log.symptoms) && log.symptoms.length
      ? log.symptoms
      : String(log.symptom || '').split(',').map(value => value.trim()).filter(Boolean)
    return (symptom === 'ทั้งหมด' || labels.includes(symptom)) && analyticsPeriodMatches(log.datetime, granularity, target)
  })
  const summary = summarizeSymptoms(visible.map(log => ({ ...log, symptom: log.symptom })))
  const labels = ['00', '06', '12', '18', '21']
  const values = [0, 6, 12, 18, 21].map(hour => summary.hourlyCounts.slice(hour, hour + 3).reduce((a, b) => a + b, 0))
  const max = Math.max(...values, 1)
  const [selectedYearNumber, selectedMonthNumber] = selectedMonth.split('-').map(Number)
  const trend = granularity === 'daily'
    ? Array.from({ length: 8 }, (_, index) => ({
      label: String(index * 3).padStart(2, '0'),
      value: visible.filter(log => new Date(log.datetime).getHours() >= index * 3 && new Date(log.datetime).getHours() < index * 3 + 3).length,
    }))
    : granularity === 'yearly'
      ? TH_MONTHS.map((label, month) => ({ label, value: visible.filter(log => new Date(log.datetime).getMonth() === month).length }))
      : Array.from({ length: new Date(selectedYearNumber, selectedMonthNumber, 0).getDate() }, (_, index) => ({
        label: String(index + 1),
        value: visible.filter(log => new Date(log.datetime).getDate() === index + 1).length,
      }))
  const trendMax = Math.max(...trend.map(item => item.value), 1)
  const periodLabel = granularity === 'daily' ? 'รายวัน' : granularity === 'yearly' ? 'รายปี' : 'รายเดือน'
  const trendTitle = `จำนวนอาการ ${symptom} ${periodLabel}`
  const frequentWindowTitle = `ช่วงที่เกิดอาการ (${symptom}) บ่อยที่สุด`
  return <>
    <div className="filters" aria-label="ตัวกรองกราฟอาการ">
      <label>อาการ<select aria-label="อาการที่ต้องการ" value={symptom} onChange={event => setSymptom(event.target.value)}><option>ทั้งหมด</option>{symptoms.map(item => <option key={symptomKey(item)}>{symptomLabel(item)}</option>)}</select></label>
      <label>ช่วง<select aria-label="รูปแบบช่วงเวลา" value={granularity} onChange={event => setGranularity(event.target.value)}><option value="daily">รายวัน</option><option value="monthly">รายเดือน</option><option value="yearly">รายปี</option></select></label>
      {granularity === 'daily' && <label>วันที่<input aria-label="วันที่ที่ต้องการ" type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} /></label>}
      {granularity === 'monthly' && <label>เดือน<input aria-label="เดือนที่ต้องการ" type="month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} /></label>}
      {granularity === 'yearly' && <label>ปี ค.ศ.<input aria-label="ปีที่ต้องการ" type="number" min="2000" max="2100" value={selectedYear} onChange={event => setSelectedYear(event.target.value)} /></label>}
    </div>
    <section className="insight" aria-label={trendTitle}><b>{trendTitle}</b><p>รวม {visible.length} รายการในช่วงที่เลือก</p><div className="bars trend-bars">{trend.map(item => <div key={item.label} className={item.value ? 'hot' : ''} title={`${item.label}: ${item.value} ครั้ง`} style={{ height: `${Math.max(8, item.value / trendMax * 100)}%` }}><span>{item.label}</span></div>)}</div></section>
    <section className="insight" aria-label={frequentWindowTitle}><b>{frequentWindowTitle}</b><p>{summary.mostFrequentWindow ? `${String(summary.mostFrequentWindow.startHour).padStart(2, '0')}:00–${String(summary.mostFrequentWindow.endHour).padStart(2, '0')}:00 · ${summary.mostFrequentWindow.count} ครั้ง` : 'ยังไม่มีข้อมูลอาการ'}</p><div className="bars">{values.map((value, i) => <div key={labels[i]} className={i === 3 ? 'hot' : ''} style={{ height: `${Math.max(8, value / max * 100)}%` }}><span>{labels[i]}</span></div>)}</div></section>
    {showRecords && <><div className="section-title"><h2>รายการบันทึก</h2><small>ตามตัวกรองด้านบน</small></div>
      <div className="data-table"><div className="table-head"><span>วัน / เวลา</span><span>รายการ + Track ณ เวลานั้น</span><span /></div>{visible.map(log => <div className="table-row" key={log.id}><time>{new Date(log.datetime).toLocaleDateString('th-TH')}<br />{log.datetime.slice(11, 16)}</time><div><b>{log.symptom}{log.diary ? ` · ${log.diary}` : ''}</b>{(log.tracks || []).map(track => <em key={track.id}>{track.name} · {track.dose} · {track.schedule}</em>)}</div><div className="row-actions"><button onClick={() => onEdit(log)}>แก้ไข</button><button className="danger" onClick={() => onDelete(log.id)}>ลบ</button></div></div>)}</div></>}
  </>
}

function DailyRecords({ logs, activities, onEditLog, onDeleteLog }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [collapsedDays, setCollapsedDays] = useState(() => new Set())
  const groups = new Map()
  const add = (date, item) => {
    if (!date || (dateFrom && date < dateFrom) || (dateTo && date > dateTo)) return
    if (!groups.has(date)) groups.set(date, { logs: [], activities: [], notes: [], symptoms: new Map(), tracks: new Map() })
    const group = groups.get(date)
    if (item.kind === 'log') group.logs.push(item.value)
    if (item.kind === 'activity') group.activities.push(item.value)
    if (item.kind === 'log') {
      const log = item.value
      if (log.diary || log.diary_text || log.diary_log_text) group.notes.push(log)
      const labels = Array.isArray(log.symptoms) && log.symptoms.length
        ? log.symptoms
        : String(log.symptom || '').split(',').map(value => value.trim()).filter(Boolean)
      const time = String(log.datetime || '').slice(11, 16)
      labels.forEach(label => {
        const normalized = String(label).trim()
        if (!normalized) return
        if (!group.symptoms.has(normalized)) group.symptoms.set(normalized, { label: normalized, times: [], logs: [] })
        const symptom = group.symptoms.get(normalized)
        if (time && !symptom.times.includes(time)) symptom.times.push(time)
        if (!symptom.logs.some(entry => entry.id === log.id)) symptom.logs.push(log)
      })
    }
    ;(item.value.tracks || []).forEach(track => group.tracks.set(track.id || track.name, track))
  }
  logs.forEach(log => add(String(log.datetime || '').slice(0, 10), { kind: 'log', value: log }))
  activities.forEach(activity => add(String(activity.datetime || activity.occurred_at || '').slice(0, 10), { kind: 'activity', value: activity }))
  const days = [...groups.entries()].sort(([a], [b]) => b.localeCompare(a))
  const toggleDay = date => setCollapsedDays(current => {
    const next = new Set(current)
    if (next.has(date)) next.delete(date)
    else next.add(date)
    return next
  })
  const clearDates = () => { setDateFrom(''); setDateTo(''); setCollapsedDays(new Set()) }
  return <section aria-label="รายการบันทึก" className="daily-records">
    <div className="section-title"><h2>รายการบันทึก</h2><small>{days.length} วัน</small></div>
    <div className="daily-filter" aria-label="กรองช่วงวันที่">
      <label>ตั้งแต่<input aria-label="วันที่เริ่มต้น" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></label>
      <span aria-hidden="true">ถึง</span>
      <label>ถึง<input aria-label="วันที่สิ้นสุด" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></label>
      {(dateFrom || dateTo) && <button className="text-button" onClick={clearDates}>ล้างตัวกรอง</button>}
    </div>
    {!days.length && <p className="empty-state">ไม่พบบันทึกในช่วงวันที่นี้</p>}
    {days.map(([date, group]) => {
      const isCollapsed = collapsedDays.has(date)
      return <article className={`daily-card ${isCollapsed ? 'is-collapsed' : ''}`} key={date}>
        <button className="daily-day-toggle" aria-expanded={!isCollapsed} onClick={() => toggleDay(date)}>
          <span><b>{new Date(`${date}T00:00:00`).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</b><small>{group.logs.length} อาการ · {group.activities.length} กิจวัตร</small></span><strong aria-hidden="true">{isCollapsed ? '+' : '−'}</strong>
        </button>
        {!isCollapsed && <div className="daily-card-body">
          {[...group.tracks.values()].length > 0 && <p className="daily-tracks"><b>รายการที่เลือก:</b> {[...group.tracks.values()].map(track => <em key={track.id || track.name}>{track.name}</em>)}</p>}
          {group.activities.length > 0 && <section className="daily-section daily-activities" aria-label="กิจวัตร"><h3>กิจวัตร</h3>{group.activities.map(activity => <div className="daily-entry" key={activity.id}><time>{String(activity.datetime || activity.occurred_at).slice(11, 16)}</time><div><b>{activity.activity_type || activity.symptom}</b>{activity.duration_minutes !== '' && activity.duration_minutes !== undefined && <small>{activity.duration_minutes} นาที</small>}{(activity.note || activity.diary) && <p>{activity.note || activity.diary}</p>}</div></div>)}</section>}
          {group.symptoms.size > 0 && <section className="daily-section daily-symptoms" aria-label="อาการ"><h3>อาการ</h3>{[...group.symptoms.values()].map(symptom => <div className="daily-symptom-row" key={symptom.label}><b>{symptom.label}</b><span>{symptom.times.join(', ')}</span></div>)}</section>}
          {group.notes.length > 0 && <section className="daily-section daily-notes" aria-label="โน้ต"><h3>โน้ต</h3>{group.notes.map(log => <div className="daily-note-row" key={log.id}><time>{String(log.datetime).slice(11, 16)}</time><p>{log.diary || log.diary_text || log.diary_log_text}</p><div className="row-actions"><button onClick={() => onEditLog(log)}>แก้ไข</button><button className="danger" onClick={() => onDeleteLog(log.id)}>ลบ</button></div></div>)}</section>}
        </div>}
      </article>
    })}
  </section>
}

function petIcon(pet) {
  if (pet?.species === 'cat') return '🐱'
  if (pet?.species === 'dog') return '🐶'
  return '🐾'
}

function petAccessory(pet) {
  if (pet?.species !== 'dog') return ''
  if (pet?.gender === 'male') return '👔'
  if (pet?.gender === 'female') return '🎀'
  return ''
}

function migrateLegacyOwners(state) {
  const ownerId = state.activePetId || state.pets?.find(pet => pet.active !== false)?.id || state.pets?.[0]?.id
  if (!ownerId) return state
  const collections = ['tracks', 'logs', 'activities', 'reminders', 'symptoms', 'treatmentHistory']
  return collections.reduce((next, key) => ({
    ...next,
    [key]: (next[key] || []).map(item => item.pet_id ? item : { ...item, pet_id: ownerId }),
  }), { ...state })
}

function App({ initialPage = 'home' }) {
  const initial = migrateLegacyOwners(loadStoredState(window.localStorage, LOCAL_STATE_KEY, { tracks: seedTracks, logs: seedLogs, activities: seedActivities, reminders: defaultReminders, symptoms: defaultSymptoms, pets: defaultPets, treatmentHistory: defaultTreatmentHistory, lineRecipients: defaultLineRecipients }))
  const rememberedGoogleSheet = loadStoredState(window.localStorage, GOOGLE_SHEET_META_KEY, null)
  const hasRememberedGoogleSheet = Boolean(rememberedGoogleSheet?.spreadsheetId)
  const hasCompletedGoogleOnboarding = hasRememberedGoogleSheet
  const [page, setPage] = useState(MAIN_APP_PAGES.has(initialPage) ? initialPage : 'home')
  const [pets, setPets] = useState(initial.pets ?? defaultPets)
  const [activePetId, setActivePetId] = useState(initial.activePetId ?? (initial.pets ?? defaultPets)[0]?.id)
  const [trackTab, setTrackTab] = useState('track')
  const [selectedTracks, setSelectedTracks] = useState([])
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileFormOpen, setProfileFormOpen] = useState(false)
  const [editingPetId, setEditingPetId] = useState('')
  const [profileName, setProfileName] = useState('')
  const [profileSpecies, setProfileSpecies] = useState('dog')
  const [profileGender, setProfileGender] = useState('')
  const [profileBirthdate, setProfileBirthdate] = useState('')
  const [profileBreed, setProfileBreed] = useState('')
  const [profilePhoto, setProfilePhoto] = useState('')
  const [settingsSection, setSettingsSection] = useState('')
  const [tracks, setTracks] = useState(initial.tracks ?? seedTracks)
  const [logs, setLogs] = useState(initial.logs ?? seedLogs)
  const [activities, setActivities] = useState(initial.activities ?? seedActivities)
  const [activityFormOpen, setActivityFormOpen] = useState(false)
  const [editingActivityId, setEditingActivityId] = useState('')
  const [activityType, setActivityType] = useState(ACTIVITY_TYPES[0])
  const [activityCustomType, setActivityCustomType] = useState('')
  const [activityDatetime, setActivityDatetime] = useState(nowLocal())
  const [activityDuration, setActivityDuration] = useState('')
  const [activityNote, setActivityNote] = useState('')
  const [selectedSymptoms, setSelectedSymptoms] = useState([])
  const [note, setNote] = useState('')
  const [datetime, setDatetime] = useState(nowLocal())
  const [googleConnection, setGoogleConnection] = useState(null)
  const [showGoogleOnboarding, setShowGoogleOnboarding] = useState(!hasCompletedGoogleOnboarding)
  const [remoteReady, setRemoteReady] = useState(false)
  const [syncStatus, setSyncStatus] = useState('idle')
  const [syncError, setSyncError] = useState('')
  const remoteRevisionRef = useRef(0)
  const remoteSaveQueueRef = useRef(Promise.resolve())
  const formContextRef = useRef(null)
  const [reminders, setReminders] = useState(initial.reminders ?? defaultReminders)
  const [symptoms, setSymptoms] = useState(initial.symptoms ?? defaultSymptoms)
  const [treatmentHistory, setTreatmentHistory] = useState(initial.treatmentHistory ?? defaultTreatmentHistory)
  const [lineRecipients, setLineRecipients] = useState(initial.lineRecipients ?? defaultLineRecipients)
  const [treatmentCategory, setTreatmentCategory] = useState(TREATMENT_CATEGORIES[0])
  const [treatmentCustomCategory, setTreatmentCustomCategory] = useState('')
  const [treatmentTitle, setTreatmentTitle] = useState('')
  const [treatmentStartedAt, setTreatmentStartedAt] = useState(nowLocal())
  const [treatmentClinic, setTreatmentClinic] = useState('')
  const [treatmentDoctor, setTreatmentDoctor] = useState('')
  const [treatmentNote, setTreatmentNote] = useState('')
  const [editingTreatmentId, setEditingTreatmentId] = useState('')
  const [treatmentFormOpen, setTreatmentFormOpen] = useState(false)
  const [lineUserId, setLineUserId] = useState('')
  const [lineRecipientError, setLineRecipientError] = useState('')
  const [trackFormOpen, setTrackFormOpen] = useState(false)
  const [editingTrackId, setEditingTrackId] = useState('')
  const [trackName, setTrackName] = useState('')
  const [trackDose, setTrackDose] = useState('')
  const [trackSchedule, setTrackSchedule] = useState('')
  const [symptomFormOpen, setSymptomFormOpen] = useState(false)
  const [editingSymptomId, setEditingSymptomId] = useState('')
  const [symptomName, setSymptomName] = useState('')
  const [symptomError, setSymptomError] = useState('')
  const [reminderFormOpen, setReminderFormOpen] = useState(false)
  const [reminderTitle, setReminderTitle] = useState('')
  const [reminderDate, setReminderDate] = useState('')
  const [reminderFrequency, setReminderFrequency] = useState('ครั้งเดียว')
  const [reminderError, setReminderError] = useState('')
  const [structuredReminderFormOpen, setStructuredReminderFormOpen] = useState(false)
  const [structuredReminderEditId, setStructuredReminderEditId] = useState('')
  const [editingLogId, setEditingLogId] = useState('')
  const [logEditDatetime, setLogEditDatetime] = useState('')
  const [logEditDiary, setLogEditDiary] = useState('')
  const [activityError, setActivityError] = useState('')
  const [treatmentError, setTreatmentError] = useState('')
  const availablePets = pets.filter(item => item.active !== false)
  const activePet = availablePets.find(item => item.id === activePetId) || availablePets[0] || defaultPets[0]
  const activePetLabel = activePet.demo ? `${activePet.name} (Demo profile)` : activePet.name
  const activePetAge = useMemo(() => calculatePetAge(activePet.birthdate), [activePet.birthdate])
  const activePetStage = petLifeStage(activePetAge)
  const belongsToPet = item => item.pet_id ? item.pet_id === activePet.id : availablePets.length === 1
  const visibleTracks = tracks.filter(belongsToPet)
  const visibleLogs = logs.filter(belongsToPet)
  const visibleActivities = activities.filter(belongsToPet)
  const visibleReminders = reminders.filter(belongsToPet)
  const visibleTreatmentHistory = treatmentHistory.filter(belongsToPet)
  const visibleSymptoms = symptoms.filter(item => item?.active !== false && (!item?.pet_id || item.pet_id === activePet.id))
  const activeTracks = visibleTracks.filter(track => track.active !== false)
  const canSave = selectedSymptoms.length > 0 || note.trim().length > 0
  const health = useMemo(() => {
    const latestWeight = visibleActivities.find(item => (item.activity_type || item.symptom) === 'น้ำหนัก')
    const walksToday = visibleActivities.filter(item => (item.activity_type || item.symptom) === 'เดิน' && new Date(item.datetime).toDateString() === new Date().toDateString()).length
    return { symptoms: visibleLogs.length, weight: latestWeight ? (latestWeight.weight_kg || latestWeight.note || latestWeight.diary || 'บันทึกแล้ว') : '—', walk: walksToday || '—' }
  }, [visibleActivities, visibleLogs.length])
  useEffect(() => {
    const handlePopState = () => setPage(mainPageFromSearch())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (availablePets.length > 0 && !availablePets.some(item => item.id === activePetId)) setActivePetId(availablePets[0].id)
  }, [availablePets, activePetId])

  useEffect(() => {
    setSelectedSymptoms([])
    setSelectedTracks([])
    setNote('')
    setDatetime(nowLocal())
    setEditingLogId('')
  }, [activePetId])

  const clearTrackDraft = () => {
    setTrackFormOpen(false)
    setEditingTrackId('')
    setTrackName('')
    setTrackDose('')
    setTrackSchedule('')
  }
  const clearSymptomDraft = () => {
    setSymptomFormOpen(false)
    setEditingSymptomId('')
    setSymptomName('')
    setSymptomError('')
  }
  const navigateMainPage = nextPage => {
    if (nextPage !== page) {
      clearTrackDraft()
      clearSymptomDraft()
    }
    if (nextPage === 'settings') setSettingsSection('')
    setPage(nextPage)
    window.history.pushState({}, '', mainPageHref(nextPage))
  }

  useEffect(() => {
    saveStoredState(window.localStorage, LOCAL_STATE_KEY, { tracks, logs, activities, reminders, symptoms, pets, treatmentHistory, lineRecipients, activePetId })
  }, [tracks, logs, activities, reminders, symptoms, pets, treatmentHistory, lineRecipients, activePetId])

  useEffect(() => {
    if (!googleConnection || !remoteReady) return undefined
    const requestRevision = ++remoteRevisionRef.current
    const pendingState = { tracks, logs, activities, reminders, symptoms, pets, treatmentHistory, lineRecipients, activePetId }
    saveStoredState(window.localStorage, REMOTE_OUTBOX_KEY, { revision: requestRevision, state: pendingState })
    if (isCurrentRemoteRevision(remoteRevisionRef.current, requestRevision)) {
      setSyncStatus('pending')
      setSyncError('')
    }
    const timeout = window.setTimeout(() => {
      if (!isCurrentRemoteRevision(remoteRevisionRef.current, requestRevision)) return
      setSyncStatus('saving')
      setSyncError('')
      const queuedSave = remoteSaveQueueRef.current
        .catch(() => undefined)
        .then(() => saveRemoteState(googleConnection.accessToken, googleConnection.spreadsheetId, pendingState))
      remoteSaveQueueRef.current = queuedSave
      queuedSave
        .then(() => {
          if (!isCurrentRemoteRevision(remoteRevisionRef.current, requestRevision)) return
          window.localStorage.removeItem(REMOTE_OUTBOX_KEY)
          setSyncStatus('saved')
          setSyncError('')
        })
        .catch(error => {
          if (!isCurrentRemoteRevision(remoteRevisionRef.current, requestRevision)) return
          saveStoredState(window.localStorage, REMOTE_OUTBOX_KEY, { revision: requestRevision, state: pendingState })
          setSyncStatus('error')
          setSyncError(error.message || 'Google Sheet save failed')
        })
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [tracks, logs, activities, reminders, symptoms, pets, treatmentHistory, lineRecipients, activePetId, googleConnection, remoteReady])

  const handleGoogleConnected = async (connection) => {
    if (googleConnection?.spreadsheetId && googleConnection.spreadsheetId === connection?.spreadsheetId && remoteReady) return
    setRemoteReady(false)
    try {
      const remote = await loadRemoteState(connection.accessToken, connection.spreadsheetId)
      const isNewSheet = connection.created === true
      const outbox = isNewSheet ? null : loadStoredState(window.localStorage, REMOTE_OUTBOX_KEY, null)
      const pendingState = isNewSheet ? null : unwrapPendingState(outbox)
      const fallback = isNewSheet
        ? { tracks: [], logs: [], activities: [], reminders: [], symptoms: [], pets: defaultPets, treatmentHistory: [], lineRecipients: [], activePetId: defaultPets[0].id }
        : { tracks, logs, activities, reminders, symptoms, pets, treatmentHistory, lineRecipients, activePetId, ...(pendingState || {}) }
      const hydrated = hydrateRemoteState(remote, fallback, pendingState)
      setTracks(hydrated.tracks)
      setLogs(hydrated.logs)
      setActivities(hydrated.activities ?? [])
      setReminders(hydrated.reminders)
      setSymptoms(hydrated.symptoms ?? defaultSymptoms)
      setPets(hydrated.pets?.length ? hydrated.pets : (isNewSheet ? defaultPets : pets))
      setTreatmentHistory(hydrated.treatmentHistory ?? [])
      setLineRecipients(hydrated.lineRecipients ?? [])
      setActivePetId(hydrated.activePetId || (isNewSheet ? defaultPets[0].id : activePetId))
      setGoogleConnection(connection)
      setRemoteReady(true)
      window.localStorage.setItem(GOOGLE_ONBOARDING_KEY, 'connected')
      setShowGoogleOnboarding(false)
      if (isNewSheet) window.localStorage.removeItem(REMOTE_OUTBOX_KEY)
      for (const recipient of hydrated.lineRecipients ?? []) {
        await provisionGoogleLineLink({ accessToken: connection.accessToken, spreadsheetId: connection.spreadsheetId, lineUserId: recipient.recipient_id })
      }
    } catch (error) {
      setSyncStatus('error')
      setSyncError(error.message || 'โหลดข้อมูลจาก Google Sheet ไม่สำเร็จ')
      throw error
    }
  }
  const provisionLine = async (connection, recipientId) => {
    await provisionGoogleLineLink({ accessToken: connection.accessToken, spreadsheetId: connection.spreadsheetId, lineUserId: recipientId })
  }

  const saveLog = () => {
    if (!canSave) return
    const linked = selectedTracks.map(id => activeTracks.find(track => track.id === id)).filter(Boolean).map(track => ({ ...track }))
    setLogs([{ id: `log_${Date.now()}`, pet_id: activePet.id, datetime, symptom: selectedSymptoms.join(', '), diary: note.trim(), tracks: linked }, ...logs])
    setSelectedSymptoms([]); setSelectedTracks([]); setNote(''); setDatetime(nowLocal())
  }
  const openTrackForm = (track = null) => {
    setEditingTrackId(track?.id || '')
    setTrackName(track?.name || '')
    setTrackDose(track?.dose || '')
    setTrackSchedule(track?.schedule || '')
    setTrackFormOpen(true)
  }
  const resetTrackForm = clearTrackDraft
  const resetSymptomForm = clearSymptomDraft
  const saveTrack = () => {
    if (!trackName.trim() || !trackSchedule.trim()) return
    const track = tracks.find(item => item.id === editingTrackId)
    if (!track) {
      setTracks([...tracks, { id: `track_${Date.now()}`, pet_id: activePet.id, name: trackName.trim(), dose: trackDose.trim(), schedule: trackSchedule.trim(), active: true }])
      resetTrackForm()
      return
    }
    const name = trackName
    const dose = trackDose
    const schedule = trackSchedule
    const timestamp = new Date().toISOString()
    const currentVersionId = track.version_id || `${track.id}_current`
    const closedVersion = {
      id: currentVersionId,
      tracking_item_id: track.id,
      pet_id: track.pet_id || activePet.id,
      name: track.version_name || track.name || '',
      dose: track.dose || '',
      schedule_type: track.schedule_type || 'display',
      schedule_config: track.schedule_config || { display: track.schedule || '' },
      start_at: track.start_at || track.created_at || '',
      end_at: timestamp,
      active: false,
      created_at: track.version_created_at || track.created_at || timestamp,
      updated_at: timestamp,
    }
    const nextVersionId = `${track.id}_version_${Date.now()}`
    const nextVersion = {
      id: nextVersionId,
      tracking_item_id: track.id,
      pet_id: track.pet_id || activePet.id,
      name: name.trim(),
      dose: dose.trim(),
      schedule_type: 'display',
      schedule_config: { display: schedule.trim() },
      start_at: timestamp,
      end_at: '',
      active: track.active !== false,
      created_at: timestamp,
      updated_at: timestamp,
    }
    const historical = (track.versions || []).filter(version => String(version.id) !== String(currentVersionId))
    setTracks(tracks.map(item => item.id === track.id ? {
      ...item,
      name: name.trim(),
      dose: dose.trim(),
      schedule: schedule.trim(),
      version_id: nextVersionId,
      version_name: name.trim(),
      schedule_type: 'display',
      schedule_config: { display: schedule.trim() },
      start_at: timestamp,
      end_at: '',
      version_active: item.active !== false,
      version_created_at: timestamp,
      version_updated_at: timestamp,
      updated_at: timestamp,
      versions: [...historical, closedVersion, nextVersion],
    } : item))
    resetTrackForm()
  }
  const deleteTrack = track => {
    setTracks(tracks.filter(item => item.id !== track.id))
  }
  const openLogEditor = log => {
    setEditingLogId(log.id)
    setLogEditDatetime(log.datetime || nowLocal())
    setLogEditDiary(log.diary || '')
  }
  const saveLogEdit = () => {
    if (!editingLogId || !logEditDatetime) return
    setLogs(logs.map(item => item.id === editingLogId ? {
      ...item,
      datetime: logEditDatetime,
      diary: logEditDiary.trim(),
      diary_text: logEditDiary.trim(),
      diary_log_text: logEditDiary.trim(),
      diary_log_present: logEditDiary.trim().length > 0,
    } : item))
    setEditingLogId('')
  }
  const openActivityForm = activity => {
    const existingType = activity?.activity_type || activity?.symptom || ACTIVITY_TYPES[0]
    setEditingActivityId(activity?.id || '')
    setActivityType(ACTIVITY_TYPES.includes(existingType) ? existingType : 'อื่นๆ')
    setActivityCustomType(ACTIVITY_TYPES.includes(existingType) ? '' : existingType)
    setActivityDatetime(activity?.datetime || activity?.occurred_at || nowLocal())
    setActivityDuration(activity?.duration_minutes === undefined || activity?.duration_minutes === null ? '' : String(activity.duration_minutes))
    setActivityNote(activity?.note || activity?.diary || '')
    setActivityFormOpen(true)
  }
  const saveActivity = () => {
    const selectedType = activityType === 'อื่นๆ' ? activityCustomType.trim() : activityType
    if (!selectedType || !activityDatetime) {
      setActivityError('กรุณาระบุประเภทกิจวัตรและวันเวลา')
      return
    }
    setActivityError('')
    const timestamp = new Date().toISOString()
    if (editingActivityId) {
      setActivities(activities.map(item => item.id === editingActivityId ? {
        ...item,
        datetime: activityDatetime,
        occurred_at: activityDatetime,
        symptom: selectedType,
        activity_type: selectedType,
        duration_minutes: activityDuration.trim(),
        diary: activityNote.trim(),
        note: activityNote.trim(),
        updated_at: timestamp,
      } : item))
    } else {
      setActivities([{ id: `activity_${Date.now()}`, pet_id: activePet.id, datetime: activityDatetime, occurred_at: activityDatetime, symptom: selectedType, activity_type: selectedType, duration_minutes: activityDuration.trim(), diary: activityNote.trim(), note: activityNote.trim(), created_at: timestamp, updated_at: timestamp }, ...activities])
    }
    setActivityFormOpen(false)
    setEditingActivityId('')
    setActivityType(ACTIVITY_TYPES[0])
    setActivityCustomType('')
    setActivityDatetime(nowLocal())
    setActivityDuration('')
    setActivityNote('')
  }
  const addActivity = () => openActivityForm()
  const editActivity = activity => {
    openActivityForm(activity)
  }
  const addSymptom = () => {
    const normalized = symptomName.trim()
    if (!normalized) {
      setSymptomError('กรุณาระบุชื่ออาการ')
      return
    }
    if (symptoms.some(item => item.id !== editingSymptomId && (!item.pet_id || item.pet_id === activePet.id) && symptomLabel(item).trim().toLowerCase() === normalized.toLowerCase())) {
      setSymptomError('อาการนี้มีอยู่แล้ว รวมอาการที่ปิดใช้งานด้วย')
      return
    }
    setSymptomError('')
    if (editingSymptomId) setSymptoms(symptoms.map(item => item.id === editingSymptomId ? { ...item, label_th: normalized } : item))
    else setSymptoms([...symptoms, { id: `symptom_${Date.now()}`, pet_id: activePet.id, label_th: normalized, label_en: '', active: true }])
    setSymptomName('')
    setEditingSymptomId('')
    resetSymptomForm()
  }
  const openSymptomForm = (symptom = null) => { setEditingSymptomId(symptom?.id || ''); setSymptomName(symptomLabel(symptom || '')); setSymptomError(''); setSymptomFormOpen(true) }
  const resetProfileForm = () => {
    setProfileFormOpen(false)
    setEditingPetId('')
    setProfileName('')
    setProfileSpecies('dog')
    setProfileGender('')
    setProfileBirthdate('')
    setProfileBreed('')
    setProfilePhoto('')
  }
  const openProfileForm = (pet = null) => {
    setEditingPetId(pet?.id || '')
    setProfileName(pet?.name || '')
    setProfileSpecies(pet?.species || 'dog')
    setProfileGender(pet?.gender || '')
    setProfileBirthdate(pet?.birthdate || '')
    setProfileBreed(pet?.breed || '')
    setProfilePhoto(pet?.photo || '')
    setProfileFormOpen(true)
  }
  const savePetProfile = () => {
    if (!profileName.trim()) return
    const timestamp = new Date().toISOString()
    const details = { name: profileName.trim(), species: profileSpecies, gender: profileGender, birthdate: profileBirthdate, breed: profileBreed.trim(), photo: profilePhoto, demo: false, updated_at: timestamp }
    if (editingPetId) {
      setPets(pets.map(item => item.id === editingPetId ? { ...item, ...details } : item))
    } else {
      const id = `pet_${Date.now()}`
      setPets([...pets, { id, ...details, active: true, created_at: timestamp }])
      setActivePetId(id)
    }
    resetProfileForm()
  }
  const resetTreatmentForm = () => {
    setTreatmentFormOpen(false)
    setEditingTreatmentId('')
    setTreatmentCategory(TREATMENT_CATEGORIES[0])
    setTreatmentCustomCategory('')
    setTreatmentTitle('')
    setTreatmentStartedAt(nowLocal())
    setTreatmentClinic('')
    setTreatmentDoctor('')
    setTreatmentNote('')
  }
  const saveTreatment = () => {
    const selectedCategory = treatmentCategory === 'อื่นๆ' ? treatmentCustomCategory.trim() : treatmentCategory
    if (!selectedCategory || !treatmentTitle.trim() || !treatmentStartedAt) {
      setTreatmentError('กรุณาระบุประเภท รายการ และวันเวลา')
      return
    }
    setTreatmentError('')
    const timestamp = new Date().toISOString()
    if (editingTreatmentId) {
      setTreatmentHistory(treatmentHistory.map(item => item.id === editingTreatmentId ? {
        ...item,
        category: selectedCategory,
        title: treatmentTitle.trim(),
        started_at: treatmentStartedAt,
        clinic: treatmentClinic.trim(),
        doctor: treatmentDoctor.trim(),
        note: treatmentNote.trim(),
        updated_at: timestamp,
      } : item))
    } else {
      setTreatmentHistory([{ id: `treatment_${Date.now()}`, pet_id: activePet.id, category: selectedCategory, title: treatmentTitle.trim(), started_at: treatmentStartedAt, ended_at: '', clinic: treatmentClinic.trim(), doctor: treatmentDoctor.trim(), note: treatmentNote.trim(), created_at: timestamp, updated_at: timestamp }, ...treatmentHistory])
    }
    resetTreatmentForm()
  }
  const editTreatment = item => {
    const knownCategory = TREATMENT_CATEGORIES.slice(0, -1).includes(item.category)
    setTreatmentFormOpen(true)
    setEditingTreatmentId(item.id)
    setTreatmentCategory(knownCategory ? item.category : 'อื่นๆ')
    setTreatmentCustomCategory(knownCategory ? '' : (item.category || ''))
    setTreatmentTitle(item.title || '')
    setTreatmentStartedAt(item.started_at || nowLocal())
    setTreatmentClinic(item.clinic || '')
    setTreatmentDoctor(item.doctor || '')
    setTreatmentNote(item.note || '')
  }
  const addLineRecipient = () => {
    const normalized = lineUserId.trim()
    if (!/^U[0-9a-fA-F]{32}$/.test(normalized)) {
      setLineRecipientError('USER ID ต้องขึ้นต้นด้วย U และตามด้วยตัวอักษร/ตัวเลขฐาน 16 จำนวน 32 ตัว')
      return
    }
    if (lineRecipients.some(item => String(item.recipient_id || '').toLowerCase() === normalized.toLowerCase())) {
      setLineRecipientError('USER ID นี้ถูกเพิ่มแล้ว')
      return
    }
    setLineRecipients([...lineRecipients, { id: `line_recipient_${Date.now()}`, reminder_id: '*', recipient_id: normalized, created_at: new Date().toISOString() }])
    if (googleConnection) {
      provisionLine(googleConnection, normalized).catch(error => setLineRecipientError(error.message || 'เชื่อม LINE กับ Google Sheet ไม่สำเร็จ'))
    }
    setLineUserId('')
    setLineRecipientError('')
  }
  const addReminder = () => {
    const title = reminderTitle.trim()
    const date = reminderDate.trim()
    const frequency = reminderFrequency.trim()
    if (!title || !date || !frequency || !isValidCalendarDate(date)) {
      setReminderError('กรุณาระบุชื่อ วันที่ครบกำหนด และความถี่ให้ถูกต้อง')
      return
    }
    setReminders([...reminders, {
      id: `r${Date.now()}`,
      pet_id: activePet.id,
      title,
      detail: `${date} · ${frequency} · ยังไม่ได้ตั้งผู้รับ LINE`,
      schedule_type: frequency === 'ครั้งเดียว' ? 'once' : 'recurring',
      schedule_config: { date, frequency, detail: `${date} · ${frequency} · ยังไม่ได้ตั้งผู้รับ LINE` },
      start_at: date,
      enabled: true,
    }])
    setReminderFormOpen(false)
    setReminderTitle(''); setReminderDate(''); setReminderFrequency('ครั้งเดียว'); setReminderError('')
  }

  void addReminder
  void reminderError

  const saveStructuredReminder = config => {
    const nextReminder = {
      id: `r${Date.now()}`,
      pet_id: activePet.id,
      title: config.title,
      detail: config.detail,
      schedule_type: config.frequency === 'once' ? 'once' : 'recurring',
      schedule_config: { ...config },
      start_at: config.date,
      enabled: true,
    }
    setReminders(structuredReminderEditId
      ? reminders.map(reminder => reminder.id === structuredReminderEditId ? { ...nextReminder, id: reminder.id, created_at: reminder.created_at, updated_at: new Date().toISOString() } : reminder)
      : [...reminders, nextReminder])
    setStructuredReminderFormOpen(false)
    setStructuredReminderEditId('')
  }

  useEffect(() => {
    if (!hasRememberedGoogleSheet) {
      setShowGoogleOnboarding(true)
      return undefined
    }
    let cancelled = false
    const restoreGoogleConnection = async () => {
      try {
        const accessToken = await requestGoogleAccessToken()
        const profile = await getGoogleUserProfile(accessToken)
        if (cancelled) return
        const connection = {
          ...rememberedGoogleSheet,
          email: profile.email || rememberedGoogleSheet.email,
          accessToken,
        }
        await handleGoogleConnected(connection)
      } catch (error) {
        if (cancelled) return
        setGoogleConnection(null)
        setRemoteReady(false)
        setShowGoogleOnboarding(true)
        setSyncStatus('error')
        setSyncError(error.message || 'กรุณาเชื่อมต่อ Google Sheet ใหม่')
      }
    }
    restoreGoogleConnection()
    return () => { cancelled = true }
  }, [])

  const editReminder = reminder => {
    setStructuredReminderEditId(reminder.id)
    setStructuredReminderFormOpen(true)
  }

  const reminderFormValue = reminder => {
    if (!reminder) return undefined
    let config = reminder.schedule_config
    if (typeof config === 'string') {
      try { config = JSON.parse(config) } catch { config = {} }
    }
    if (!config || typeof config !== 'object') config = {}
    const detailDate = String(reminder.detail || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || ''
    return {
      ...config,
      title: reminder.title,
      date: config.date || String(reminder.start_at || '').slice(0, 10) || detailDate,
      detail: reminder.detail,
    }
  }

  const handleProfilePhoto = event => {
    const file = event.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => setProfilePhoto(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    if (reminderFormOpen) {
      setReminderFormOpen(false)
      setStructuredReminderFormOpen(true)
    }
  }, [reminderFormOpen])

  useEffect(() => {
    if (!profileOpen && profileFormOpen) resetProfileForm()
  }, [profileOpen])

  // Settings forms are rendered outside their submenu panels. Clear them when
  // the user changes section so a form from Tracking/Symptoms cannot leak into
  // Google Sheet, LINE, or the settings overview.
  useEffect(() => {
    const context = page === 'track' && trackTab === 'track'
      ? 'main-track'
      : page === 'settings' && settingsSection === 'tracking'
        ? 'settings-tracking'
        : page === 'settings' && settingsSection === 'symptoms'
          ? 'settings-symptoms'
          : 'none'
    if (formContextRef.current && formContextRef.current !== context) {
      clearTrackDraft()
      clearSymptomDraft()
    }
    formContextRef.current = context
    if (context === 'none') {
      clearTrackDraft()
      clearSymptomDraft()
    }
  }, [page, settingsSection, trackTab])

  const changeSettingsSection = nextSection => {
    if (nextSection !== settingsSection) {
      clearTrackDraft()
      clearSymptomDraft()
    }
    setSettingsSection(nextSection)
  }

  const settingsSurface = <SettingsSurface
    section={settingsSection}
    onSectionChange={changeSettingsSection}
    tracks={visibleTracks}
    symptoms={symptoms.filter(item => !item.pet_id || item.pet_id === activePet.id)}
    lineRecipients={lineRecipients}
    reminders={visibleReminders}
    onOpenTrack={openTrackForm}
    onToggleTrack={track => setTracks(tracks.map(item => item.id === track.id ? { ...item, active: item.active === false } : item))}
    onDeleteTrack={deleteTrack}
    onOpenSymptom={openSymptomForm}
    onToggleSymptom={item => setSymptoms(symptoms.map(current => symptomKey(current) === symptomKey(item) ? { ...current, active: current.active === false } : current))}
    onDeleteSymptom={item => setSymptoms(symptoms.map(current => symptomKey(current) === symptomKey(item) ? { ...current, active: false, deleted_at: new Date().toISOString() } : current))}
    lineUserId={lineUserId}
    onLineUserIdChange={setLineUserId}
    onAddLineRecipient={addLineRecipient}
    onProvisionLine={provisionLine}
    lineRecipientError={lineRecipientError}
    trackForm={trackFormOpen ? <section className="form-card" role="dialog" aria-label="ฟอร์มรายการติดตาม"><label>ชื่อรายการ<input value={trackName} onChange={e => setTrackName(e.target.value)} /></label><label>ขนาด/รายละเอียด<input value={trackDose} onChange={e => setTrackDose(e.target.value)} /></label><label>เวลา/ความถี่<input value={trackSchedule} onChange={e => setTrackSchedule(e.target.value)} /></label><button className="primary" disabled={!trackName.trim() || !trackSchedule.trim()} onClick={saveTrack}>{editingTrackId ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}</button><button className="text-button" onClick={resetTrackForm}>ยกเลิก</button></section> : null}
    symptomForm={symptomFormOpen ? <section className="form-card" role="dialog" aria-label="ฟอร์มจัดการอาการ"><label>ชื่ออาการ<input value={symptomName} onChange={e => { setSymptomName(e.target.value); setSymptomError('') }} /></label>{symptomError && <small role="alert">{symptomError}</small>}<button className="primary" disabled={!symptomName.trim()} onClick={addSymptom}>{editingSymptomId ? 'บันทึกการแก้ไข' : 'บันทึกอาการ'}</button><button className="text-button" onClick={() => setSymptomFormOpen(false)}>ยกเลิก</button></section> : null}
    googleProps={{ connection: googleConnection, syncStatus, syncError, externalError: syncStatus === 'error' && !googleConnection ? syncError : '', onConnected: handleGoogleConnected }}
    onOpenReminders={() => navigateMainPage('reminders')}
  />

  return <main className="app-shell">
    {showGoogleOnboarding && <GoogleDriveOnboarding onConnected={handleGoogleConnected} />}
    {profileFormOpen && <div className="profile-upload-wrap"><label className="profile-upload">รูปโปรไฟล์<input type="file" accept="image/*" onChange={handleProfilePhoto} /></label>{profilePhoto && <img className="profile-upload-preview" src={profilePhoto} alt="ตัวอย่างรูปโปรไฟล์" />}</div>}
    <header><div><small>PETCARE / {page.toUpperCase()}</small><h1>{page === 'home' ? `${activePetLabel} วันนี้เป็นไง?` : page === 'track' ? 'สมุดบันทึก' : page === 'diary' ? 'ประวัติการรักษา' : page === 'reminders' ? 'แจ้งเตือน' : 'ตั้งค่า'}</h1></div><button className="profile" aria-label="จัดการโปรไฟล์สัตว์เลี้ยง" onClick={() => setProfileOpen(!profileOpen)}>{activePet.photo ? <img className="profile-photo" src={activePet.photo} alt="" /> : <span className="profile-species-icon" aria-hidden="true">{petIcon(activePet)}</span>}<span>{activePetLabel}</span></button></header>
    {profileOpen && <section className="profile-panel" aria-label="โปรไฟล์สัตว์เลี้ยง"><div className="section-title"><h2>โปรไฟล์สัตว์เลี้ยง</h2><button className="text-button" onClick={() => openProfileForm()}>＋ เพิ่มโปรไฟล์</button></div>{profileFormOpen && <section className="form-card profile-form" aria-label="ฟอร์มโปรไฟล์สัตว์เลี้ยง"><label>ชื่อสัตว์เลี้ยง<input value={profileName} onChange={e => setProfileName(e.target.value)} /></label><label>ประเภทสัตว์<select value={profileSpecies} onChange={e => setProfileSpecies(e.target.value)}><option value="dog">สุนัข</option><option value="cat">แมว</option><option value="other">อื่นๆ</option></select></label><label>เพศ<select value={profileGender} onChange={e => setProfileGender(e.target.value)}><option value="">ไม่ระบุ</option><option value="male">ผู้</option><option value="female">เมีย</option></select></label><label>วันเกิด<input type="date" value={profileBirthdate} onChange={e => setProfileBirthdate(e.target.value)} /></label><label>สายพันธุ์<input value={profileBreed} onChange={e => setProfileBreed(e.target.value)} /></label><div className="form-actions"><button className="primary" disabled={!profileName.trim()} onClick={savePetProfile}>{editingPetId ? 'บันทึกการแก้ไข' : 'เพิ่มโปรไฟล์'}</button><button className="text-button" onClick={resetProfileForm}>ยกเลิก</button></div></section>}{availablePets.map(pet => <article className="profile-row" key={pet.id}><span className="profile-species-icon" aria-hidden="true">{petIcon(pet)}</span><button className="profile-select" onClick={() => { setActivePetId(pet.id); setProfileOpen(false) }}><b>{pet.name}{pet.id === activePet.id ? ' · กำลังใช้งาน' : ''}</b><small>{pet.breed || 'ยังไม่มีรายละเอียดเพิ่มเติม'}</small></button><button className="text-button" onClick={() => openProfileForm(pet)}>แก้ไข</button></article>)}</section>}
    {page === 'home' && <><div className="hero pet-hero"><span className="hero-pet"><span className="hero-pet-icon" role="img" aria-label={`ไอคอนของ ${activePet.name}`}>{petIcon(activePet)}</span>{petAccessory(activePet) && <span className="hero-pet-accessory" aria-hidden="true">{petAccessory(activePet)}</span>}</span>{activePetAge ? <div className="hero-age"><span className="hero-age-icon">{activePetStage.icon}</span><div><small>{activePet.name} · {activePetStage.label}</small><strong>{activePetAge.years} ปี {activePetAge.months} เดือน {activePetAge.days} วัน</strong></div></div> : <div className="hero-age-empty">เพิ่มวันเกิดใน Profile</div>}</div><div className="stats"><article>อาการ<b>{health.symptoms}</b></article><article>น้ำหนัก<b>{health.weight}</b></article><article>เดินวันนี้<b>{health.walk}</b></article></div><div className="section-title"><h2>กราฟติดตามอาการ</h2><small>เลือกวัน เดือน หรือปีได้</small></div><Summary logs={visibleLogs} symptoms={visibleSymptoms} showRecords={false} /><DailyRecords logs={visibleLogs} activities={visibleActivities} onEditLog={openLogEditor} onDeleteLog={id => setLogs(logs.filter(log => log.id !== id))} />{editingLogId && <section className="form-card" role="dialog" aria-label="ฟอร์มแก้ไขบันทึก"><label>วันที่และเวลา<input type="datetime-local" value={logEditDatetime} onChange={e => setLogEditDatetime(e.target.value)} /></label><label>บันทึก<textarea value={logEditDiary} onChange={e => setLogEditDiary(e.target.value)} /></label><button className="primary" onClick={saveLogEdit}>บันทึกการแก้ไข</button><button className="text-button" onClick={() => setEditingLogId('')}>ยกเลิก</button></section>}</>}
    {page === 'track' && <><nav className="tabs" aria-label="แท็บติดตาม"><button className={trackTab === 'track' ? 'active' : ''} onClick={() => setTrackTab('track')}>Track</button><button className={trackTab === 'activity' ? 'active' : ''} onClick={() => setTrackTab('activity')}>กิจวัตร</button></nav>{trackTab === 'track' ? <><div className="section-title"><h2>รายการที่กำลังติดตาม</h2><button className="add-button" onClick={() => openTrackForm()}>＋ เพิ่มรายการติดตาม</button></div>{trackFormOpen && <section className="form-card" aria-label="ฟอร์มรายการติดตาม"><label>ชื่อรายการ<input value={trackName} onChange={e => setTrackName(e.target.value)} /></label><label>ขนาด/รายละเอียด<input value={trackDose} onChange={e => setTrackDose(e.target.value)} /></label><label>เวลา/ความถี่<input value={trackSchedule} onChange={e => setTrackSchedule(e.target.value)} /></label><div className="form-actions"><button className="primary" disabled={!trackName.trim() || !trackSchedule.trim()} onClick={saveTrack}>{editingTrackId ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}</button><button className="text-button" onClick={resetTrackForm}>ยกเลิก</button></div></section>}{activeTracks.map(track => <article className="track-card compact" key={track.id}><label className="track-toggle"><input type="checkbox" aria-label={`เลือก ${track.name}`} checked={selectedTracks.includes(track.id)} onChange={() => setSelectedTracks(selectedTracks.includes(track.id) ? selectedTracks.filter(id => id !== track.id) : [...selectedTracks, track.id])} /></label><div><b>{track.name}</b><small>{track.dose} · {track.schedule}</small></div></article>)}<section className="log-form"><div className="section-title"><h2>บันทึกอาการ</h2><button className="text-button" onClick={() => { setSymptomError(''); setSymptomFormOpen(true) }}>＋ เพิ่มอาการ</button></div>{symptomFormOpen && <section className="form-card" aria-label="ฟอร์มเพิ่มอาการ"><label>ชื่ออาการ<input value={symptomName} onChange={e => { setSymptomName(e.target.value); setSymptomError('') }} /></label>{symptomError && <small role="alert">{symptomError}</small>}<div className="form-actions"><button className="primary" disabled={!symptomName.trim()} onClick={addSymptom}>บันทึกอาการ</button><button className="text-button" onClick={() => setSymptomFormOpen(false)}>ยกเลิก</button></div></section>}<input aria-label="วันที่และเวลาบันทึก" type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} /><div className="symptom-grid">{visibleSymptoms.map(item => { const label = symptomLabel(item); return <button key={symptomKey(item)} className={selectedSymptoms.includes(label) ? 'selected' : ''} onClick={() => setSelectedSymptoms(selectedSymptoms.includes(label) ? selectedSymptoms.filter(x => x !== label) : [...selectedSymptoms, label])}>{label}</button> })}</div><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="เพิ่มบันทึกไดอารี่ (ไม่บังคับ)" /><button className="primary" disabled={!canSave} onClick={saveLog}>บันทึกอาการและ Track</button></section></> : <><div className="section-title"><h2>กิจวัตร</h2><button className="primary" onClick={addActivity}>＋ บันทึกกิจวัตร</button></div>{visibleActivities.map(item => <article className="table-row" key={item.id}><time>{String(item.datetime).slice(5, 10)}<br />{String(item.datetime).slice(11, 16)}</time><div><b>{item.activity_type || item.symptom}</b><p>{item.note || item.diary}</p></div><div className="row-actions"><button onClick={() => editActivity(item)}>แก้ไข</button><button className="danger" onClick={() => setActivities(activities.filter(activity => activity.id !== item.id))}>ลบ</button></div></article>)}{activityFormOpen && <section className="form-card activity-form" aria-label="ฟอร์มกิจวัตร"><label>ประเภทกิจวัตร<select value={activityType} onChange={e => setActivityType(e.target.value)}>{ACTIVITY_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>{activityType === 'อื่นๆ' && <label>ระบุประเภท<input value={activityCustomType} onChange={e => setActivityCustomType(e.target.value)} /></label>}<label>วันและเวลา<input type="datetime-local" value={activityDatetime} onChange={e => setActivityDatetime(e.target.value)} /></label><label>ระยะเวลา (นาที)<input type="number" min="0" value={activityDuration} onChange={e => setActivityDuration(e.target.value)} /></label><label>Note<textarea value={activityNote} onChange={e => setActivityNote(e.target.value)} /></label>{activityError && <small role="alert">{activityError}</small>}<button className="primary" onClick={saveActivity}>บันทึกกิจวัตร</button></section>}</>}</>}
    {page === 'diary' && <><div className="section-title"><h2>ประวัติการรักษา</h2><button className="primary" onClick={() => setTreatmentFormOpen(true)}>＋ เพิ่มประวัติการรักษา</button></div><div className="data-table">{visibleTreatmentHistory.map(item => <article className="table-row" key={item.id}><time>{item.started_at?.slice(5, 10)}<br />{item.started_at?.slice(11, 16)}</time><div><b>{item.category} · {item.title}</b><p>{item.clinic}</p>{item.doctor && <p>หมอ: {item.doctor}</p>}<p>{item.note}</p></div><div className="row-actions"><button onClick={() => editTreatment(item)}>แก้ไข</button><button className="danger" onClick={() => setTreatmentHistory(treatmentHistory.filter(history => history.id !== item.id))}>ลบ</button></div></article>)}</div>{treatmentFormOpen && <section className="form-card treatment-form" aria-label="ฟอร์มประวัติการรักษา"><label>ประเภท<select value={treatmentCategory} onChange={e => setTreatmentCategory(e.target.value)}>{TREATMENT_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>{treatmentCategory === 'อื่นๆ' && <label>ระบุประเภท<input value={treatmentCustomCategory} onChange={e => setTreatmentCustomCategory(e.target.value)} /></label>}<label>รายการ<input value={treatmentTitle} onChange={e => setTreatmentTitle(e.target.value)} /></label><label>วันที่/เวลา<input type="datetime-local" value={treatmentStartedAt} onChange={e => setTreatmentStartedAt(e.target.value)} /></label><label>คลินิก<input value={treatmentClinic} onChange={e => setTreatmentClinic(e.target.value)} /></label><label>ชื่อหมอ<input value={treatmentDoctor} onChange={e => setTreatmentDoctor(e.target.value)} placeholder="เช่น นพ. ..." /></label><label>Note<textarea value={treatmentNote} onChange={e => setTreatmentNote(e.target.value)} /></label>{treatmentError && <small role="alert">{treatmentError}</small>}<button className="primary" disabled={!treatmentTitle.trim()} onClick={saveTreatment}>บันทึก</button></section>}</>}
    {page === 'reminders' && <section className="reminder-page"><div className="section-title"><div><h2>แจ้งเตือน</h2><small>ตั้งรอบและเวลาส่งแจ้งเตือนเข้า LINE</small></div><button className="primary reminder-create" onClick={() => { setStructuredReminderEditId(''); setStructuredReminderFormOpen(true) }}>＋ สร้างการแจ้งเตือน</button></div>{visibleReminders.length === 0 && <div className="reminder-empty"><b>ยังไม่มีการแจ้งเตือน</b><p>สร้างรายการแรกเพื่อกำหนดวัน รอบ และเวลาที่ต้องการ</p></div>}<div className="reminder-list">{visibleReminders.map(reminder => <article className={`reminder ${reminder.enabled ? '' : 'off'}`} key={reminder.id}><div className="reminder-card-head"><div><b>{reminder.title}</b><p>{reminder.detail}</p></div><button type="button" className="reminder-edit" aria-label={`แก้ไข ${reminder.title}`} onClick={() => editReminder(reminder)}>แก้ไข</button></div><div className="reminder-actions"><button type="button" onClick={() => setReminders(reminders.map(item => item.id === reminder.id ? { ...item, enabled: !item.enabled } : item))}>{reminder.enabled ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button><button type="button" className="danger" onClick={() => setReminders(reminders.filter(item => item.id !== reminder.id))}>ลบ</button></div></article>)}</div>{structuredReminderFormOpen && <ReminderForm key={structuredReminderEditId || 'new'} initialValue={reminderFormValue(visibleReminders.find(reminder => reminder.id === structuredReminderEditId))} onSave={saveStructuredReminder} onCancel={() => { setStructuredReminderFormOpen(false); setStructuredReminderEditId('') }} />}</section>}
    {page === 'settings' && settingsSurface}
    <nav className="bottom-nav">{navItems.filter(([key]) => key !== 'reminders').map(([key, icon, label]) => <button aria-label={label} className={page === key ? 'active' : ''} key={key} onClick={() => navigateMainPage(key)}><span aria-hidden="true">{icon}</span>{label}</button>)}</nav>
  </main>
}

export default App
