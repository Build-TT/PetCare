import { useMemo, useState } from 'react'
import { summarizeSymptoms } from './domain/summary.js'
import './index.css'

const nowLocal = () => new Date().toISOString().slice(0, 16)
const seedTracks = [
  { id: 'track_vetmedin', name: 'Vetmedin', dose: '1.25 mg', schedule: '09:00, 21:00', active: true },
  { id: 'track_pred', name: 'Prednisolone', dose: '5 mg', schedule: 'ทุก 12 ชม.', active: true },
]
const seedLogs = [
  { id: 'log_1', datetime: '2026-07-14T18:46', symptom: 'อาเจียน', diary: 'อ่อนเพลียหลังทานอาหาร', tracks: seedTracks },
  { id: 'log_2', datetime: '2026-07-12T20:15', symptom: 'อาเจียน', diary: '1 ครั้ง', tracks: [{ ...seedTracks[0], schedule: '08:00, 20:00' }] },
  { id: 'log_3', datetime: '2026-07-10T19:30', symptom: 'ซึม', diary: 'นอนมาก', tracks: [seedTracks[1]] },
]
const symptoms = ['ซึม', 'อาเจียน', 'หอบ']
const navItems = [
  ['home', '⌂', 'หน้าหลัก'], ['track', '🐾', 'ติดตาม'], ['diary', '✎', 'ไดอารี่'],
  ['reminders', '🔔', 'เตือน'], ['settings', '⚙', 'ตั้งค่า'],
]

function Summary({ logs, onEdit, onDelete }) {
  const [symptom, setSymptom] = useState('ทั้งหมด')
  const [period, setPeriod] = useState('กรกฎาคม 2569')
  const visible = symptom === 'ทั้งหมด' ? logs : logs.filter(log => log.symptom === symptom)
  const summary = summarizeSymptoms(visible.map(log => ({ ...log, symptom: log.symptom })))
  const labels = ['00', '06', '12', '18', '21']
  const values = [0, 6, 12, 18, 21].map(hour => summary.hourlyCounts.slice(hour, hour + 3).reduce((a, b) => a + b, 0))
  const max = Math.max(...values, 1)
  return <>
    <div className="filters"><label>อาการ<select value={symptom} onChange={e => setSymptom(e.target.value)}><option>ทั้งหมด</option>{symptoms.map(x => <option key={x}>{x}</option>)}</select></label><label>ช่วงเวลา<select value={period} onChange={e => setPeriod(e.target.value)}><option>กรกฎาคม 2569</option><option>วันนี้</option><option>ปี 2569</option></select></label></div>
    <section className="insight"><b>ช่วงที่เกิดอาการบ่อยสุด</b><p>{summary.mostFrequentWindow ? `${String(summary.mostFrequentWindow.startHour).padStart(2, '0')}:00–${String(summary.mostFrequentWindow.endHour).padStart(2, '0')}:00 · ${summary.mostFrequentWindow.count} ครั้ง` : 'ยังไม่มีข้อมูลอาการ'}</p><div className="bars">{values.map((value, i) => <div key={labels[i]} className={i === 3 ? 'hot' : ''} style={{ height: `${Math.max(8, value / max * 100)}%` }}><span>{labels[i]}</span></div>)}</div></section>
    <div className="section-title"><h2>รายการบันทึก</h2><small>ตามตัวกรองด้านบน</small></div>
    <div className="data-table"><div className="table-head"><span>วัน / เวลา</span><span>รายการ + Track ณ เวลานั้น</span><span /></div>{visible.map(log => <div className="table-row" key={log.id}><time>{new Date(log.datetime).toLocaleDateString('th-TH')}<br />{log.datetime.slice(11, 16)}</time><div><b>{log.symptom}{log.diary ? ` · ${log.diary}` : ''}</b>{log.tracks.map(track => <em key={track.id}>{track.name} · {track.dose} · {track.schedule}</em>)}</div><div className="row-actions"><button onClick={() => onEdit(log)}>แก้ไข</button><button className="danger" onClick={() => onDelete(log.id)}>ลบ</button></div></div>)}</div>
  </>
}

function App() {
  const [page, setPage] = useState('home')
  const [pet, setPet] = useState('โมจิ')
  const [trackTab, setTrackTab] = useState('track')
  const [recordsTab, setRecordsTab] = useState('diary')
  const [tracks, setTracks] = useState(seedTracks)
  const [logs, setLogs] = useState(seedLogs)
  const [selectedSymptoms, setSelectedSymptoms] = useState([])
  const [note, setNote] = useState('')
  const [datetime, setDatetime] = useState(nowLocal())
  const [reminders, setReminders] = useState([{ id: 'r1', title: 'ถ่ายพยาธิ', detail: '01 ส.ค. 2569 · ทุก 3 เดือน', enabled: true }, { id: 'r2', title: 'ตรวจสุขภาพ', detail: 'ทุก 1 ปี · LINE: คุณหมอ', enabled: true }, { id: 'r3', title: 'Echo หัวใจ', detail: 'ทุก 6 เดือน', enabled: true }])
  const activeTracks = tracks.filter(track => track.active)
  const canSave = selectedSymptoms.length > 0 || note.trim().length > 0
  const health = useMemo(() => ({ symptoms: logs.length, weight: '6.8', walk: '20m' }), [logs])

  const saveLog = () => {
    if (!canSave) return
    const linked = activeTracks.map(track => ({ ...track }))
    setLogs([{ id: `log_${Date.now()}`, datetime, symptom: selectedSymptoms.join(', '), diary: note.trim(), tracks: linked }, ...logs])
    setSelectedSymptoms([]); setNote(''); setDatetime(nowLocal())
  }
  const addTrack = () => {
    const name = window.prompt('ชื่อยา / รายการติดตาม')
    if (!name?.trim()) return
    const dose = window.prompt('ขนาดยา', '') ?? ''
    const schedule = window.prompt('เวลา หรือความถี่', '09:00, 21:00') ?? ''
    setTracks([...tracks, { id: `track_${Date.now()}`, name, dose, schedule, active: true }])
  }
  const editLog = log => {
    const diary = window.prompt('แก้ไขบันทึก', log.diary ?? '')
    if (diary === null) return
    setLogs(logs.map(item => item.id === log.id ? { ...item, diary } : item))
  }

  return <main className="app-shell">
    <header><div><small>PETCARE / {page.toUpperCase()}</small><h1>{page === 'home' ? 'โมจิ วันนี้เป็นไง?' : page === 'track' ? 'ติดตามอาการ' : page === 'diary' ? 'ไดอารี่ & กิจวัตร' : page === 'reminders' ? 'แจ้งเตือน' : 'ตั้งค่า'}</h1></div><button className="profile" aria-label="สลับโปรไฟล์สัตว์เลี้ยง" onClick={() => setPet(pet === 'โมจิ' ? 'มะลิ' : 'โมจิ')}>🐶<span>{pet}</span></button></header>
    <section className="page-content">
      {page === 'home' && <><div className="hero">🐕</div><div className="stats"><article>อาการ<b>{health.symptoms}</b></article><article>น้ำหนัก<b>{health.weight}</b></article><article>เดิน<b>{health.walk}</b></article></div><div className="section-title"><h2>สุขภาพโดยรวม</h2><small>วันนี้ · รายชั่วโมง</small></div><section className="insight"><div className="bars">{[20, 42, 75, 36, 52].map((value, i) => <div key={i} className={i === 2 ? 'hot' : ''} style={{ height: `${value}%` }} />)}</div></section><div className="quick">{['💧 ฉี่', '💩 ขี้', '🐾 เดิน', '⚖️ น้ำหนัก'].map(action => <button key={action} onClick={() => setPage('diary')}>{action}</button>)}</div></>}
      {page === 'track' && <><nav className="tabs"><button className={trackTab === 'track' ? 'active' : ''} onClick={() => setTrackTab('track')}>Track</button><button className={trackTab === 'summary' ? 'active' : ''} onClick={() => setTrackTab('summary')}>Summary</button></nav>{trackTab === 'track' ? <><div className="section-title"><h2>รายการที่กำลังติดตาม</h2><small>{activeTracks.length} รายการ active</small></div>{tracks.map(track => <article className={`track-card ${track.active ? 'active' : ''}`} key={track.id}><span>✓</span><div><b>{track.name} {track.dose}</b><small>{track.schedule}</small></div><button onClick={() => setTracks(tracks.map(item => item.id === track.id ? { ...item, active: !item.active } : item))}>{track.active ? 'ACTIVE' : 'INACTIVE'}</button></article>)}<button className="add-button" onClick={addTrack}>＋ เพิ่มรายการติดตาม</button><section className="log-form"><div className="section-title"><h2>บันทึกอาการรวม</h2><small>ข้อมูลเลือกได้</small></div><input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} /><div className="linked">เชื่อมกับ Track ที่ active: {activeTracks.map(track => <em key={track.id}>{track.name}</em>)}</div><div className="section-title"><h2>อาการ <small>(ไม่บังคับ)</small></h2><button className="text-button" onClick={() => window.alert('เพิ่มอาการได้จากรายการนี้ในเวอร์ชันเชื่อม Google Sheet')}>＋ เพิ่มอาการ</button></div><div className="symptom-grid">{symptoms.map(symptom => <button key={symptom} className={selectedSymptoms.includes(symptom) ? 'selected' : ''} onClick={() => setSelectedSymptoms(selectedSymptoms.includes(symptom) ? selectedSymptoms.filter(x => x !== symptom) : [...selectedSymptoms, symptom])}>{symptom}</button>)}</div><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="✎ เพิ่มบันทึกไดอารี่ (ไม่บังคับ)" /><button className="primary" disabled={!canSave} onClick={saveLog}>บันทึกอาการและ Track</button><small className="hint">เลือกอาการ หรือพิมพ์ไดอารี่ อย่างน้อย 1 รายการ</small></section></> : <Summary logs={logs} onEdit={editLog} onDelete={id => setLogs(logs.filter(log => log.id !== id))} />}</>}
      {page === 'diary' && <><nav className="tabs"><button className={recordsTab === 'diary' ? 'active' : ''} onClick={() => setRecordsTab('diary')}>ไดอารี่</button><button className={recordsTab === 'activity' ? 'active' : ''} onClick={() => setRecordsTab('activity')}>กิจวัตร</button></nav><div className="section-title"><h2>กรกฎาคม 2569</h2><small>เลือกเดือนได้</small></div><div className="data-table"><div className="table-head"><span>วัน / เวลา</span><span>{recordsTab === 'diary' ? 'บันทึก' : 'กิจวัตร'}</span><span /></div>{(recordsTab === 'diary' ? logs : [{ id: 'a1', datetime: '2026-07-14T18:10', symptom: 'เดิน 20 นาที', diary: 'ระยะเวลา 20 นาที' }, { id: 'a2', datetime: '2026-07-14T08:15', symptom: 'ฉี่', diary: 'ปกติ' }, { id: 'a3', datetime: '2026-07-13T19:30', symptom: 'น้ำหนัก 6.8 กก.', diary: '' }]).map(item => <div className="table-row" key={item.id}><time>{item.datetime.slice(5, 10)}<br />{item.datetime.slice(11, 16)}</time><div><b>{item.symptom}</b><p>{item.diary}</p></div><div className="row-actions"><button onClick={() => editLog(item)}>แก้ไข</button><button className="danger" onClick={() => recordsTab === 'diary' && setLogs(logs.filter(log => log.id !== item.id))}>ลบ</button></div></div>)}</div><button className="primary">＋ บันทึก{recordsTab === 'diary' ? 'วันนี้' : 'กิจวัตร'}</button></>}
      {page === 'reminders' && <>{reminders.map(reminder => <article className={`reminder ${reminder.enabled ? '' : 'off'}`} key={reminder.id}><b>{reminder.title}</b><p>{reminder.detail}</p><div><button onClick={() => setReminders(reminders.map(item => item.id === reminder.id ? { ...item, enabled: !item.enabled } : item))}>{reminder.enabled ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button><button className="danger" onClick={() => setReminders(reminders.filter(item => item.id !== reminder.id))}>ลบ</button></div></article>)}<button className="primary" onClick={() => setReminders([...reminders, { id: `r${Date.now()}`, title: 'รายการอื่นๆ', detail: 'ครั้งเดียว · ยังไม่ได้ตั้งผู้รับ LINE', enabled: true }])}>＋ สร้างการแจ้งเตือน</button></>}
      {page === 'settings' && <>{[['ประวัติการรักษา', 'ตับอ่อนอักเสบ · ผ่าตัดกระดูกสันหลัง'], ['รายการที่ติดตาม', `${tracks.filter(x => x.active).length} Active · ${tracks.filter(x => !x.active).length} Inactive`], ['ผู้รับ LINE', 'มายด์ · ต้น · คุณหมอ'], ['Google Sheet', 'เชื่อมและตรวจสอบข้อมูล'], ['ภาษา', 'ไทย / English']].map(([title, detail]) => <button className="setting" key={title} onClick={() => title === 'Google Sheet' && window.alert('การเชื่อม Google Sheet จะเปิดใช้เมื่อใส่ GAS deployment URL แล้ว')}><b>{title}</b><small>{detail}</small></button>)}</>}
    </section>
    <nav className="bottom-nav">{navItems.map(([key, icon, label]) => <button aria-label={label} className={page === key ? 'active' : ''} key={key} onClick={() => setPage(key)}><span aria-hidden="true">{icon}</span>{label}</button>)}</nav>
  </main>
}

export default App
