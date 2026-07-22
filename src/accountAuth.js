const GAS_URL = import.meta.env.VITE_GAS_URL || ''
const SESSION_KEY = 'petcare.account-session.v1'

async function call(action, payload = {}) {
  if (!GAS_URL) throw new Error('ยังไม่ได้ตั้งค่า VITE_GAS_URL')
  const response = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) })
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.status === 'error') throw new Error(data?.message || `PetCare account error (${response.status})`)
  return data
}

export function getAccountSession(storage = window.localStorage) {
  try { return JSON.parse(storage.getItem(SESSION_KEY) || 'null') } catch { return null }
}

export function saveAccountSession(session, storage = window.localStorage) {
  storage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function clearAccountSession(storage = window.localStorage) { storage.removeItem(SESSION_KEY) }

export async function registerAccount(input) { return saveAccountSession(await call('accountRegister', input)) }
export async function loginAccount(username, password) { return saveAccountSession(await call('accountLogin', { username, password })) }
export async function loadAccountState(sessionToken) { return (await call('accountReadState', { session_token: sessionToken })).state }
export async function saveAccountState(sessionToken, state) { return call('accountSaveState', { session_token: sessionToken, state }) }
export async function inviteAccountUser(accessToken, spreadsheetId, email, role = 'user') {
  return call('accountInvite', { google_access_token: accessToken, spreadsheet_id: spreadsheetId, email, role })
}
