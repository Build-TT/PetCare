// ตรรกะรอบการให้ยา ฝั่ง frontend — ใช้โชว์ "ถึงกำหนดวันนี้" และ "ครั้งถัดไป"
// (logic เดียวกับ gas/Code.gs isScheduledOn/computeNextDue)

export const SCHEDULE_TYPES = ['daily', 'monthly', 'every_n_months', 'cycle']

function parseConfig(c) {
  if (!c) return {}
  if (typeof c === 'object') return c
  try { return JSON.parse(c) } catch { return {} }
}

function parseDate(s) {
  const a = String(s).split('-')
  return new Date(+a[0], (+a[1] || 1) - 1, +a[2] || 1)
}

function fmtDate(d) {
  const p = n => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function clampDay(day, d) {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return Math.min(parseInt(day, 10) || 1, last)
}

// s: { schedule_type, config, start_date }, dateStr: 'YYYY-MM-DD'
export function isScheduledOn(s, dateStr) {
  const cfg = parseConfig(s.config)
  const d = parseDate(dateStr)
  const start = parseDate(s.start_date || dateStr)
  if (d < start) return false
  switch (s.schedule_type) {
    case 'daily':
      return true
    case 'monthly':
      return d.getDate() === clampDay(cfg.day || 1, d)
    case 'every_n_months': {
      const months = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth())
      const n = Math.max(parseInt(cfg.months, 10) || 1, 1)
      return months % n === 0 && d.getDate() === clampDay(cfg.day || start.getDate(), d)
    }
    case 'cycle': {
      const on = Math.max(parseInt(cfg.on, 10) || 1, 1)
      const off = Math.max(parseInt(cfg.off, 10) || 0, 0)
      const period = on + off
      const days = Math.round((d - start) / 86400000)
      return days % period < on
    }
    default:
      return false
  }
}

export function computeNextDue(s, fromStr) {
  let d = parseDate(fromStr)
  for (let i = 0; i < 366; i++) {
    const ds = fmtDate(d)
    if (isScheduledOn(s, ds)) return ds
    d = addDays(d, 1)
  }
  return ''
}

// สรุปรอบเป็นข้อความสั้นๆ
export function describeSchedule(s, lang = 'th') {
  const cfg = parseConfig(s.config)
  const tm = s.time ? ` ${s.time}` : ''
  if (lang === 'en') {
    switch (s.schedule_type) {
      case 'daily': return `Every day${tm}`
      case 'monthly': return `Day ${cfg.day} of each month${tm}`
      case 'every_n_months': return `Every ${cfg.months} month(s), day ${cfg.day}${tm}`
      case 'cycle': return `${cfg.on} day(s) on / ${cfg.off} off${tm}`
      default: return s.schedule_type
    }
  }
  switch (s.schedule_type) {
    case 'daily': return `ทุกวัน เวลา${tm}`
    case 'monthly': return `ทุกวันที่ ${cfg.day} ของเดือน${tm}`
    case 'every_n_months': return `ทุกๆ ${cfg.months} เดือน วันที่ ${cfg.day}${tm}`
    case 'cycle': return `กิน ${cfg.on} วัน เว้น ${cfg.off} วัน${tm}`
    default: return s.schedule_type
  }
}
