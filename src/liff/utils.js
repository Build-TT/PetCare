// ค่าจาก env (Vite) — อ่านชีตตรงผ่าน Sheets API, เขียนผ่าน GAS web app
export const SHEET_ID = import.meta.env.VITE_SHEET_ID || ''
export const API_KEY  = import.meta.env.VITE_API_KEY  || ''
export const GAS_URL  = import.meta.env.VITE_GAS_URL  || ''

// LIFF IDs — hardcode เหมือนระบบเดิม (ตั้งค่าหลังสร้าง LIFF app, ดู README)
// ใช้ LIFF เดียวกันทุกหน้าได้ เพราะ routing ทำผ่าน ?page=
export const LIFF_IDS = {
  log:   '',
  pets:  '',
  meds:  '',
  types: '',
}

const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values`

// โหลด LIFF SDK แบบ dynamic — เฉพาะเมื่อเรียก initLiff
// ไม่ redirect login เมื่อเปิดในเบราว์เซอร์ปกติ (ใช้งานได้ทั้งสองทาง)
export async function initLiff(pageKey) {
  try {
    if (typeof liff === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js'
        script.charset = 'utf-8'
        script.onload = resolve
        script.onerror = reject
        document.head.appendChild(script)
      })
    }
    const liffId = LIFF_IDS[pageKey]
    if (!liffId) return
    await liff.init({ liffId })
    if (liff.isInClient() && !liff.isLoggedIn()) {
      liff.login()
    }
  } catch (e) {
    console.warn('LIFF init skipped:', e.message)
    // ไม่ crash — ใช้งานได้ในเบราว์เซอร์ปกติ
  }
}

// อ่านชีตหนึ่ง tab → array ของ object (row 1 = headers)
export async function fetchSheet(name) {
  if (!SHEET_ID || !API_KEY) throw new Error('ยังไม่ได้ตั้งค่า VITE_SHEET_ID / VITE_API_KEY')
  const res = await fetch(`${BASE}/${encodeURIComponent(name)}?key=${API_KEY}`)
  if (!res.ok) throw new Error(`โหลด ${name} ไม่ได้: ${res.status}`)
  const data = await res.json()
  const rows = data.values || []
  if (rows.length < 2) return []
  const headers = rows[0]
  return rows.slice(1).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] || '' })
    return obj
  })
}

// เขียนผ่าน GAS — Apps Script web app รับเฉพาะ GET + URL params
export async function sendToGAS(payload) {
  if (!GAS_URL) throw new Error('ยังไม่ได้ตั้งค่า VITE_GAS_URL')
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)]))
  )
  const res = await fetch(`${GAS_URL}?${params.toString()}`)
  if (!res.ok) throw new Error('GAS error: ' + res.status)
  return res.json()
}

// วันที่ปัจจุบันแบบ YYYY-MM-DD (เวลาเครื่อง)
export function todayISO() {
  const now = new Date()
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0')
}

// วันที่+เวลาปัจจุบันแบบ YYYY-MM-DDTHH:mm (ใช้เป็น default ของ <input type=datetime-local>)
export function nowLocalISO() {
  const now = new Date()
  const p = n => String(n).padStart(2, '0')
  return now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate()) +
    'T' + p(now.getHours()) + ':' + p(now.getMinutes())
}

// id แบบสั้นไว้ใช้เป็น key ของ pet/log/schedule (สร้างฝั่ง client)
export function genId(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// แปลง datetime ISO → ข้อความอ่านง่าย เช่น "7 มิ.ย. 2026 14:30"
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDateTime(iso, lang = 'th') {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return iso
  const months = lang === 'en' ? EN_MONTHS : TH_MONTHS
  const year = lang === 'en' ? d.getFullYear() : d.getFullYear() + 543
  const p = n => String(n).padStart(2, '0')
  const hasTime = iso.includes('T')
  const dateStr = `${d.getDate()} ${months[d.getMonth()]} ${year}`
  return hasTime ? `${dateStr} ${p(d.getHours())}:${p(d.getMinutes())}` : dateStr
}
