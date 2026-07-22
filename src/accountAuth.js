const GAS_URL = import.meta.env.VITE_GAS_URL || ''
const SESSION_KEY = 'petcare.account-session.v1'

async function call(action, payload = {}) {
  if (!GAS_URL) throw new Error('ยังไม่ได้ตั้งค่า VITE_GAS_URL')
  // Apps Script redirects /exec POST requests. text/plain keeps this a
  // simple cross-origin request so mobile browsers do not fail on preflight.
  const response = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ action, ...payload }) })
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.status === 'error') {
    if (action.startsWith('account') && data?.message === 'Missing LINE access token') throw new Error('Account backend ยังไม่อัปเดต กรุณา Deploy Google Apps Script เวอร์ชันล่าสุด')
    throw new Error(data?.message || `PetCare account error (${response.status})`)
  }
  return data
}

export function getAccountSession(storage) {
  const stores = storage ? [storage] : [window.localStorage, window.sessionStorage]
  for (const store of stores) {
    try {
      const session = JSON.parse(store.getItem(SESSION_KEY) || 'null')
      if (session) return session
    } catch { /* try the next storage */ }
  }
  return null
}

export function saveAccountSession(session, storage = window.localStorage) {
  storage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function clearAccountSession(storage) {
  if (storage) return storage.removeItem(SESSION_KEY)
  window.localStorage.removeItem(SESSION_KEY)
  window.sessionStorage.removeItem(SESSION_KEY)
}

function rememberSession(session, rememberMe) {
  clearAccountSession()
  return saveAccountSession(session, rememberMe ? window.localStorage : window.sessionStorage)
}

export async function registerAccount(input, rememberMe = true) { return rememberSession(await call('accountRegister', input), rememberMe) }
export async function loginAccount(username, password, rememberMe = true) { return rememberSession(await call('accountLogin', { username, password }), rememberMe) }
export async function loginGoogleAccount(accessToken, rememberMe = true) { return rememberSession(await call('accountGoogleLogin', { google_access_token: accessToken }), rememberMe) }
export async function loadAccountState(sessionToken) { return (await call('accountReadState', { session_token: sessionToken })).state }
export async function saveAccountState(sessionToken, state) { return call('accountSaveState', { session_token: sessionToken, state }) }
export async function loadAccountProfile(sessionToken) { return (await call('accountReadSession', { session_token: sessionToken })).user }
export async function inviteAccountUser(accessToken, spreadsheetId, email, role = 'user') {
  return call('accountInvite', { google_access_token: accessToken, spreadsheet_id: spreadsheetId, email, role, app_url: window.location.origin })
}
export async function listAccountUsers(accessToken, spreadsheetId) {
  return call('accountMembers', { google_access_token: accessToken, spreadsheet_id: spreadsheetId })
}
export async function revokeAccountUser(accessToken, spreadsheetId, username) {
  return call('accountRevoke', { google_access_token: accessToken, spreadsheet_id: spreadsheetId, username })
}
export async function removeAccountAccess(accessToken, spreadsheetId, email) {
  return call('accountRemoveAccess', { google_access_token: accessToken, spreadsheet_id: spreadsheetId, email })
}
export async function cancelAccountInvite(accessToken, spreadsheetId, inviteCode) {
  return call('accountCancelInvite', { google_access_token: accessToken, spreadsheet_id: spreadsheetId, invite_code: inviteCode })
}
export async function getAccountBackendVersion() { return call('appVersion') }
