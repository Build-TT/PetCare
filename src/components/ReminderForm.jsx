import { useState } from 'react'

function buildDetail(config) {
  if (config.frequency === 'once') return `${config.date} · ${config.time}`
  const unitLabel = { day: 'วัน', month: 'เดือน', year: 'ปี' }[config.unit]
  let detail = `ทุก ${config.interval} ${unitLabel} · เวลา ${config.time}`
  if (config.unit === 'month') {
    detail += config.monthMode === 'fixed_day'
      ? ` · วันที่ ${config.day} ของเดือน`
      : ' · นับครบเดือนตามวันที่เริ่มต้น'
  }
  return `${config.date} · ${detail}`
}

export default function ReminderForm({ onSave, onCancel }) {
  const today = new Date()
  const defaultDate = ''
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [frequency, setFrequency] = useState('once')
  const [interval, setInterval] = useState('1')
  const [unit, setUnit] = useState('month')
  const [time, setTime] = useState('08:00')
  const [monthMode, setMonthMode] = useState('anniversary')
  const [day, setDay] = useState(String(today.getDate()))
  const [error, setError] = useState('')

  const save = () => {
    const normalizedInterval = Number(interval)
    const normalizedDay = Number(day)
    if (!title.trim() || !date || !time || (frequency !== 'once' && (!Number.isInteger(normalizedInterval) || normalizedInterval < 1))) {
      setError('กรุณากรอกชื่อ วันที่ เวลา และรอบการแจ้งเตือนให้ครบถ้วน')
      return
    }
    if (unit === 'month' && monthMode === 'fixed_day' && (!Number.isInteger(normalizedDay) || normalizedDay < 1 || normalizedDay > 31)) {
      setError('วันที่ของเดือนต้องอยู่ระหว่าง 1 ถึง 31')
      return
    }
    onSave({
      title: title.trim(),
      date,
      time,
      frequency,
      interval: frequency === 'once' ? 0 : normalizedInterval,
      unit: frequency === 'once' ? '' : unit,
      monthMode: unit === 'month' ? monthMode : '',
      day: unit === 'month' && monthMode === 'fixed_day' ? normalizedDay : '',
      detail: buildDetail({ title, date, time, frequency, interval: normalizedInterval, unit, monthMode, day: normalizedDay }),
    })
  }

  return <section className="form-card reminder-form" role="dialog" aria-label="ฟอร์มสร้างการแจ้งเตือน">
    <label>ชื่อการแจ้งเตือน<input value={title} onChange={event => { setTitle(event.target.value); setError('') }} /></label>
    <label>วันครบกำหนด<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <label>ความถี่<select value={frequency} onChange={event => setFrequency(event.target.value)}><option value="once">ครั้งเดียว</option><option value="recurring">ทุก x หน่วย</option></select></label>
    {frequency === 'recurring' && <div className="reminder-interval-row"><label>ทุกกี่หน่วย<input type="number" min="1" step="1" value={interval} onChange={event => setInterval(event.target.value)} /></label><label>หน่วย<select value={unit} onChange={event => setUnit(event.target.value)}><option value="day">วัน</option><option value="month">เดือน</option><option value="year">ปี</option></select></label></div>}
    {frequency === 'recurring' && unit === 'month' && <><label>รูปแบบการนับเดือน<select value={monthMode} onChange={event => setMonthMode(event.target.value)}><option value="anniversary">นับครบเดือนตามวันที่เริ่มต้น</option><option value="fixed_day">ทุกวันที่กำหนดของเดือน</option></select></label>{monthMode === 'fixed_day' && <label>วันที่ของเดือน (1–31)<input type="number" min="1" max="31" step="1" value={day} onChange={event => setDay(event.target.value)} /></label>}</>}
    <label>เวลาแจ้งเตือน<input type="time" value={time} onChange={event => setTime(event.target.value)} /></label>
    {error && <small role="alert">{error}</small>}
    <button className="primary" onClick={save}>บันทึกการแจ้งเตือน</button>
    <button className="text-button" onClick={onCancel}>ยกเลิก</button>
  </section>
}
