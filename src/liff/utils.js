// ค่าจาก env (Vite) — ทุกการอ่าน/เขียนผ่าน authenticated GAS web app
export const GAS_URL  = import.meta.env.VITE_GAS_URL  || ''

// LIFF IDs — hardcode เหมือนระบบเดิม (ตั้งค่าหลังสร้าง LIFF app, ดู README)
// ใช้ LIFF เดียวกันทุกหน้าได้ เพราะ routing ทำผ่าน ?page=
export const LIFF_IDS = {
  log:   '',
  pets:  '',
  meds:  '',
  types: '',
  pet:   '',
}

let liffAccessToken = ''

// โหลด LIFF SDK แบบ dynamic — เฉพาะเมื่อเรียก initLiff
// ไม่ redirect login เมื่อเปิดในเบราว์เซอร์ปกติ (ใช้งานได้ทั้งสองทาง)
export async function initLiff(pageKey) {
  const liffId = LIFF_IDS[pageKey]
  if (!liffId) throw new Error(`ยังไม่ได้ตั้งค่า LIFF ID สำหรับ ${pageKey}`)
  if (typeof liff === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js'
      script.charset = 'utf-8'
      script.onload = resolve
      script.onerror = () => reject(new Error('โหลด LINE LIFF SDK ไม่สำเร็จ'))
      document.head.appendChild(script)
    })
  }
  await liff.init({ liffId })
  if (!liff.isLoggedIn()) {
    liff.login()
    throw new Error('กรุณาเข้าสู่ระบบ LINE เพื่อดำเนินการต่อ')
  }
  liffAccessToken = liff.getAccessToken() || ''
  if (!liffAccessToken) throw new Error('ไม่พบ LINE access token')
  return liffAccessToken
}

// อ่านชีตหนึ่ง tab → array ของ object (row 1 = headers)
export async function fetchSheet(name) {
  const data = await sendToGAS({ action: 'readSheet', sheet: name })
  return data.rows || []
}

export async function linkGoogleSheet(googleAccessToken, spreadsheetId = '', endpoint = GAS_URL) {
  return sendToGAS({ action: 'linkGoogleSheet', google_access_token: googleAccessToken, spreadsheet_id: spreadsheetId }, endpoint)
}

// อ่านและเขียนผ่าน GAS authenticated POST เท่านั้น
export async function sendToGAS(payload, endpoint = GAS_URL) {
  if (!endpoint) throw new Error('ยังไม่ได้ตั้งค่า VITE_GAS_URL')
  if (!liffAccessToken) throw new Error('ไม่พบ LINE access token; กรุณาเปิดผ่าน LIFF ใหม่')
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${liffAccessToken}` },
    body: JSON.stringify({ ...payload, access_token: liffAccessToken }),
  })
  let data = null
  try { data = await res.json() } catch { /* handled below */ }
  if (!res.ok) throw new Error(data?.message || data?.error || `GAS error: ${res.status}`)
  if (!data || data.status === 'error' || data.ok === false) {
    throw new Error(data?.message || data?.error || 'GAS request failed')
  }
  return data
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
