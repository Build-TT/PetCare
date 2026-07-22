/**
 * PetCare — Google Apps Script backend
 * ────────────────────────────────────────────────────────────────────────
 * หน้าที่:
 *   1) เป็น web app รับคำสั่งอ่าน/เขียนผ่าน authenticated doPost เท่านั้น
 *   2) checkReminders() ผูกกับ time-driven trigger รายชั่วโมง → ส่ง LINE push
 *   3) provisionUser() รับ Google OAuth จากเว็บเพื่อผูก Sheet กับ LINE User ID
 *
 * วิธีติดตั้ง (ดู README.md ประกอบ):
 *   1. เจ้าของระบบเปิด Apps Script โปรเจกต์เดียว → วางไฟล์นี้และ deploy ครั้งเดียว
 *   2. รันฟังก์ชัน setupSheets() หนึ่งครั้ง เพื่อสร้าง tab + headers + seed log_types
 *   3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone
 *      → คัดลอก URL ไปใส่ VITE_GAS_URL
 *   4. ตั้งค่า Script Properties (Project Settings → Script Properties):
 *        LINE_TOKEN = channel access token ของ Messaging API
 *        LINE_CHANNEL_SECRET = channel secret ของ Messaging API สำหรับตรวจ Webhook signature
 *        reminder_recipients sheet = recipient IDs scoped to each reminder and user Sheet
 *        LINE_CHANNEL_IDS = allowlisted LINE Channel IDs returned by token verification
 *        LINE_ADMIN_USER_IDS = verified LINE user IDs allowed to run testPush
 *      Google Sheet mapping is created by authenticated linkGoogleSheet() (LIFF)
 *      or provisionUser() (main web app). Both verify the Google token and
 *      confirm the Sheet owner email; customers never edit these properties.
 *   5. รัน installReminderTrigger() หนึ่งครั้ง เพื่อสร้าง trigger รายชั่วโมง
 */

var SHEETS = {
  pets: ['id', 'name', 'species', 'gender', 'breed', 'birthdate', 'photo', 'color', 'active', 'order', 'created_at'],
  log_types: ['key', 'label_th', 'label_en', 'icon', 'needs_detail', 'active', 'order'],
  logs: ['id', 'pet_id', 'type', 'datetime', 'detail', 'created_at'],
  med_schedules: ['id', 'pet_id', 'med_name', 'dose', 'schedule_type', 'config', 'time',
                  'start_date', 'last_done', 'next_due', 'active', 'created_at'],
  app_users: ['id', 'email', 'role', 'active', 'created_at', 'updated_at'],
  tracking_items: ['id', 'pet_id', 'name', 'active', 'created_at', 'updated_at'],
  tracking_versions: ['id', 'tracking_item_id', 'pet_id', 'name', 'dose', 'schedule_type', 'schedule_config', 'start_at', 'end_at', 'active', 'created_at', 'updated_at'],
  symptom_catalog: ['id', 'pet_id', 'label_th', 'label_en', 'active', 'created_at', 'updated_at'],
  symptom_logs: ['id', 'pet_id', 'occurred_at', 'symptoms_json', 'diary_text', 'tracking_snapshot_json', 'created_at', 'updated_at'],
  diary_logs: ['id', 'pet_id', 'occurred_at', 'text', 'created_at', 'updated_at'],
  activity_logs: ['id', 'pet_id', 'activity_type', 'occurred_at', 'duration_minutes', 'weight_kg', 'note', 'created_at', 'updated_at'],
  treatment_history: ['id', 'pet_id', 'category', 'title', 'started_at', 'ended_at', 'clinic', 'doctor', 'note', 'created_at', 'updated_at'],
  reminders: ['id', 'pet_id', 'type', 'title', 'schedule_type', 'schedule_config', 'start_at', 'end_at', 'active', 'created_at', 'updated_at'],
  reminder_recipients: ['id', 'reminder_id', 'recipient_id', 'created_at'],
  reminder_deliveries: ['id', 'reminder_id', 'recipient_id', 'scheduled_at', 'status', 'response_code', 'created_at'],
  audit_events: ['id', 'pet_id', 'actor_email', 'action', 'entity_type', 'entity_id', 'created_at'],
  app_state: ['key', 'value', 'updated_at'],
}

var PETCARE_SPREADSHEET_ID = 'PETCARE_SPREADSHEET_ID'
var CURRENT_LINE_USER_ID = ''
var USER_SHEET_PREFIX = 'PETCARE_USER_SHEET_'
var USER_LINK_PREFIX = 'PETCARE_USER_LINK_'
var LINE_ADMIN_USER_IDS = 'LINE_ADMIN_USER_IDS'
var LINE_CHANNEL_IDS = 'LINE_CHANNEL_IDS'
var LINE_CHANNEL_SECRET = 'LINE_CHANNEL_SECRET'
var LINE_GROUPS_PROPERTY = 'PETCARE_LINE_GROUPS'
var LINE_GROUP_SELECTIONS_PROPERTY = 'PETCARE_LINE_GROUP_SELECTIONS'
var GAS_WEBHOOK_SECRET = 'GAS_WEBHOOK_SECRET'
var ACCOUNT_USERS_PROPERTY = 'PETCARE_ACCOUNT_USERS'
var ACCOUNT_SESSIONS_PROPERTY = 'PETCARE_ACCOUNT_SESSIONS'
var PETCARE_BACKEND_VERSION = '2026.07.22.1'
var CURRENT_ACCOUNT_USER = null

var DEFAULT_LOG_TYPES = [
  ['med',     'ให้ยา',       'Medicine', '💊', 'FALSE', 'TRUE', '1'],
  ['pee',     'ฉี่',         'Pee',      '💧', 'FALSE', 'TRUE', '2'],
  ['poop',    'ขี้',         'Poop',     '💩', 'FALSE', 'TRUE', '3'],
  ['vaccine', 'วัคซีน',      'Vaccine',  '💉', 'TRUE',  'TRUE', '4'],
  ['checkup', 'ตรวจสุขภาพ',  'Checkup',  '🩺', 'TRUE',  'TRUE', '5'],
  ['symptom', 'อาการ',       'Symptom',  '🤒', 'TRUE',  'TRUE', '6'],
]

// ── สร้าง tab + headers + seed (รันครั้งเดียวตอนติดตั้ง) ───────────────────
function setupSheets(spreadsheetId) {
  var ss = getSpreadsheet(spreadsheetId)
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name)
    if (!sh) sh = ss.insertSheet(name)
    if (sh.getLastRow() === 0) {
      sh.appendRow(SHEETS[name])
    } else {
      ensureHeaders(sh, SHEETS[name])
    }
  })
  // seed log_types ถ้ายังว่าง
  var lt = ss.getSheetByName('log_types')
  if (lt.getLastRow() <= 1) {
    DEFAULT_LOG_TYPES.forEach(function (r) { lt.appendRow(r) })
  }
}

function getSpreadsheet(spreadsheetId) {
  var props = PropertiesService.getScriptProperties()
  var id = spreadsheetId || (CURRENT_LINE_USER_ID
    ? props.getProperty(USER_SHEET_PREFIX + CURRENT_LINE_USER_ID)
    : props.getProperty(PETCARE_SPREADSHEET_ID))
  if (CURRENT_LINE_USER_ID && !id) throw new Error('LINE user is not authorized for a PetCare spreadsheet')
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet()
}

function linkGoogleSheet(p) {
  if (!CURRENT_LINE_USER_ID) throw new Error('LINE identity is required')
  var google = verifyGoogleIdentity(p.google_access_token)
  var props = PropertiesService.getScriptProperties()
  var mappedId = String(props.getProperty(USER_SHEET_PREFIX + CURRENT_LINE_USER_ID) || '')
  var storedLink = parseStoredLink(props.getProperty(USER_LINK_PREFIX + CURRENT_LINE_USER_ID))
  var storedId = String((storedLink && storedLink.spreadsheet_id) || '')
  if (mappedId && storedId && mappedId !== storedId) throw new Error('Existing LINE-to-Sheet mapping is inconsistent')
  var linkedId = mappedId || storedId
  if (linkedId) {
    if (p.spreadsheet_id && String(p.spreadsheet_id) !== linkedId) throw new Error('LINE account is already linked to a different Google Sheet')
    if (storedLink && ((storedLink.google_sub && storedLink.google_sub !== google.sub) ||
        (storedLink.google_email && String(storedLink.google_email).toLowerCase() !== google.email))) {
      throw new Error('Existing LINE-to-Sheet mapping belongs to a different Google account')
    }
    var existingFile = getGoogleOwnedSpreadsheet(linkedId, p.google_access_token, google.email)
    shareWithScriptIdentity(existingFile.id, p.google_access_token)
    setupSheets(existingFile.id)
    if (!mappedId) props.setProperty(USER_SHEET_PREFIX + CURRENT_LINE_USER_ID, existingFile.id)
    if (!storedId) props.setProperty(USER_LINK_PREFIX + CURRENT_LINE_USER_ID, JSON.stringify({
      line_user_id: CURRENT_LINE_USER_ID, google_sub: google.sub, google_email: google.email, spreadsheet_id: existingFile.id,
    }))
    return { status: 'ok', spreadsheet_id: existingFile.id, spreadsheet_name: existingFile.name, reused: true }
  }
  var id = String(p.spreadsheet_id || '')
  var file
  if (id) {
    file = getGoogleOwnedSpreadsheet(id, p.google_access_token, google.email)
  } else {
    file = createGoogleSpreadsheet(p.google_access_token, 'PetCare - ' + google.email)
  }
  shareWithScriptIdentity(file.id, p.google_access_token)
  // Initialize the verified/provisioned file before publishing the LINE mapping.
  // getSpreadsheet(spreadsheetId) avoids requiring a mapping during setup.
  setupSheets(file.id)
  props.setProperty(USER_SHEET_PREFIX + CURRENT_LINE_USER_ID, file.id)
  props.setProperty(USER_LINK_PREFIX + CURRENT_LINE_USER_ID, JSON.stringify({
    line_user_id: CURRENT_LINE_USER_ID, google_sub: google.sub, google_email: google.email, spreadsheet_id: file.id,
  }))
  return { status: 'ok', spreadsheet_id: file.id, spreadsheet_name: file.name }
}

// Provision a user from the main web app. Google OAuth authenticates the
// account that owns the Sheet; the LINE user ID is supplied by the app after
// the user explicitly enables LINE notifications. This keeps Bot credentials
// in Script Properties and avoids asking end users to open Apps Script.
function provisionUser(p, google) {
  var lineUserId = String(p.line_user_id || '').trim()
  if (!/^U[0-9a-fA-F]{32}$/.test(lineUserId)) throw new Error('Invalid LINE user ID')
  var spreadsheetId = String(p.spreadsheet_id || '').trim()
  if (!spreadsheetId) throw new Error('Google Sheet ID is required')

  var props = PropertiesService.getScriptProperties()
  var mappedId = String(props.getProperty(USER_SHEET_PREFIX + lineUserId) || '')
  var storedLink = parseStoredLink(props.getProperty(USER_LINK_PREFIX + lineUserId))
  var storedId = String((storedLink && storedLink.spreadsheet_id) || '')
  if ((mappedId && mappedId !== spreadsheetId) || (storedId && storedId !== spreadsheetId)) {
    throw new Error('LINE account is already linked to a different Google Sheet')
  }
  if (storedLink && storedLink.google_sub && storedLink.google_sub !== google.sub) {
    throw new Error('Existing LINE-to-Sheet mapping belongs to a different Google account')
  }

  var file = getGoogleOwnedSpreadsheet(spreadsheetId, p.google_access_token, google.email)
  shareWithScriptIdentity(file.id, p.google_access_token)
  setupSheets(file.id)
  props.setProperty(USER_SHEET_PREFIX + lineUserId, file.id)
  props.setProperty(USER_LINK_PREFIX + lineUserId, JSON.stringify({
    line_user_id: lineUserId,
    google_sub: google.sub,
    google_email: google.email,
    spreadsheet_id: file.id,
  }))
  return { status: 'ok', spreadsheet_id: file.id, spreadsheet_name: file.name, linked: true }
}

function parseStoredLink(value) {
  if (!value) return null
  try { return JSON.parse(value) } catch (err) { throw new Error('Existing LINE-to-Sheet mapping metadata is invalid') }
}

function verifyGoogleIdentity(accessToken) {
  if (!accessToken) throw new Error('Google access token is required for account linking')
  var response = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken }, muteHttpExceptions: true,
  })
  if (response.getResponseCode() !== 200) throw new Error('Google identity verification failed')
  var user = JSON.parse(response.getContentText() || '{}')
  if (!user.sub || !user.email) throw new Error('Google identity is incomplete')
  return { sub: user.sub, email: String(user.email).toLowerCase() }
}

function getGoogleOwnedSpreadsheet(id, accessToken, email) {
  var response = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=id,name,mimeType,owners(emailAddress)', {
    headers: { Authorization: 'Bearer ' + accessToken }, muteHttpExceptions: true,
  })
  if (response.getResponseCode() !== 200) throw new Error('Google Sheet ownership verification failed')
  var file = JSON.parse(response.getContentText() || '{}')
  var owners = (file.owners || []).map(function (owner) { return String(owner.emailAddress || '').toLowerCase() })
  if (file.mimeType !== 'application/vnd.google-apps.spreadsheet' || owners.indexOf(email) < 0) throw new Error('Google Sheet must be owned by the linked Google account')
  return file
}

function createGoogleSpreadsheet(accessToken, title) {
  var response = UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + accessToken },
    payload: JSON.stringify({ properties: { title: title } }), muteHttpExceptions: true,
  })
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('Google Sheet provisioning failed')
  var file = JSON.parse(response.getContentText() || '{}')
  if (!file.spreadsheetId) throw new Error('Google Sheet provisioning returned no id')
  return { id: file.spreadsheetId, name: title }
}

function shareWithScriptIdentity(spreadsheetId, accessToken) {
  var scriptEmail = Session.getEffectiveUser().getEmail()
  if (!scriptEmail) throw new Error('GAS effective user email is unavailable; cannot provision Sheet access')
  var permissionList = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(spreadsheetId) + '/permissions?fields=permissions(emailAddress,role,type)', {
    headers: { Authorization: 'Bearer ' + accessToken }, muteHttpExceptions: true,
  })
  if (permissionList.getResponseCode() !== 200) throw new Error('Google Sheet permission check failed')
  var permissions = JSON.parse(permissionList.getContentText() || '{}').permissions || []
  var existing = permissions.find(function (permission) {
    return permission.type === 'user' && String(permission.emailAddress || '').toLowerCase() === String(scriptEmail).toLowerCase() && ['owner', 'writer'].indexOf(permission.role) >= 0
  })
  if (existing) return
  var response = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(spreadsheetId) + '/permissions?sendNotificationEmail=false', {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + accessToken },
    payload: JSON.stringify({ type: 'user', role: 'writer', emailAddress: scriptEmail }), muteHttpExceptions: true,
  })
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('Google Sheet could not be shared with GAS effective user')
}

// Adds missing columns only. Existing data and user-created columns are preserved.
function ensureHeaders(sh, requiredHeaders) {
  var lastColumn = sh.getLastColumn()
  var existing = lastColumn ? sh.getRange(1, 1, 1, lastColumn).getValues()[0] : []
  requiredHeaders.forEach(function (header) {
    if (existing.indexOf(header) >= 0) return
    sh.getRange(1, existing.length + 1).setValue(header)
    existing.push(header)
  })
}

// ── trigger ───────────────────────────────────────────────────────────────
function installReminderTrigger() {
  // ลบ trigger เก่าของ checkReminders ก่อน กันซ้ำ
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkReminders') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('checkReminders').timeBased().everyHours(1).create()
}

// ── web app entrypoint ─────────────────────────────────────────────────────
function accountStore(key) {
  var props = PropertiesService.getScriptProperties()
  try { return JSON.parse(props.getProperty(key) || '{}') || {} } catch (err) { return {} }
}
function saveAccountStore(key, value) { PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(value)) }
function accountHash(password, salt) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + ':' + String(password))) }
function accountToken() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '') }
function accountPublic(user) { return { username: user.username, email: user.email || '', name: user.name || '', surname: user.surname || '', role: user.role || 'user', spreadsheet_id: user.spreadsheet_id || '', status: user.status || 'active' } }
function accountUsername(value) {
  var username = String(value || '').trim().toLowerCase()
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error('Username ต้องมี 3-40 ตัว และใช้ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง')
  return username
}
function verifyAccountSession(token) {
  var sessions = accountStore(ACCOUNT_SESSIONS_PROPERTY), session = sessions[String(token || '')]
  if (!session || Number(session.expires_at) < new Date().getTime()) throw new Error('Account session หมดอายุ กรุณา Login ใหม่')
  var user = accountStore(ACCOUNT_USERS_PROPERTY)[session.username]
  if (!user || user.active === false) throw new Error('ไม่พบบัญชี PetCare หรือบัญชีถูกปิดใช้งาน')
  CURRENT_ACCOUNT_USER = user
  return user
}
function newAccountSession(user) {
  var token = accountToken(), sessions = accountStore(ACCOUNT_SESSIONS_PROPERTY)
  sessions[token] = { username: user.username, expires_at: new Date().getTime() + 30 * 86400000 }
  saveAccountStore(ACCOUNT_SESSIONS_PROPERTY, sessions)
  return { status: 'ok', session_token: token, expires_at: sessions[token].expires_at, user: accountPublic(user) }
}
function registerAccount(p) {
  var username = accountUsername(p.username), password = String(p.password || ''), email = String(p.email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email is required and must be valid')
  if (password.length < 8) throw new Error('Password ต้องมีอย่างน้อย 8 ตัวอักษร')
  if (!String(p.name || '').trim() || !String(p.surname || '').trim()) throw new Error('กรุณากรอกชื่อและนามสกุล')
  var users = accountStore(ACCOUNT_USERS_PROPERTY)
  if (users[username]) throw new Error('Username นี้ถูกใช้งานแล้ว')
  var inviteCode = String(p.invite_code || '').trim().toUpperCase(), invite = inviteCode ? users['__invite__' + inviteCode] : null
  if (inviteCode && !invite) throw new Error('Invite code ไม่ถูกต้องหรือหมดอายุ')
  var salt = accountToken().slice(0, 24)
  var user = { username: username, email: String(p.email || invite?.email || '').trim().toLowerCase(), name: String(p.name).trim(), surname: String(p.surname).trim(), role: invite?.role || 'user', spreadsheet_id: invite?.spreadsheet_id || '', active: true, salt: salt, password_hash: accountHash(password, salt), created_at: nowIso(), updated_at: nowIso() }
  users[username] = user; if (invite) delete users['__invite__' + inviteCode]; saveAccountStore(ACCOUNT_USERS_PROPERTY, users)
  return newAccountSession(user)
}
function loginAccount(p) {
  var username = accountUsername(p.username), user = accountStore(ACCOUNT_USERS_PROPERTY)[username]
  if (!user || user.active === false || accountHash(String(p.password || ''), user.salt) !== user.password_hash) throw new Error('Username หรือ Password ไม่ถูกต้อง')
  return newAccountSession(user)
}
function googleAccountUsername(users) {
  var username = 'google-' + accountToken().slice(0, 12).toLowerCase()
  while (users[username]) username = 'google-' + accountToken().slice(0, 12).toLowerCase()
  return username
}
function googleLoginAccount(p) {
  var google = verifyGoogleIdentity(p.google_access_token), users = accountStore(ACCOUNT_USERS_PROPERTY), user = null, key = ''
  Object.keys(users).some(function (candidate) {
    if (candidate.indexOf('__invite__') === 0) return false
    if (String(users[candidate].email || '').toLowerCase() === google.email) { key = candidate; user = users[candidate]; return true }
    return false
  })
  if (!user) {
    Object.keys(users).some(function (candidate) {
      var invite = users[candidate]
      if (candidate.indexOf('__invite__') === 0 && String(invite.email || '').toLowerCase() === google.email) {
        key = googleAccountUsername(users)
        user = { username: key, email: google.email, name: '', surname: '', role: invite.role || 'user', spreadsheet_id: invite.spreadsheet_id || '', active: true, google_sub: google.sub, salt: '', password_hash: '', created_at: nowIso(), updated_at: nowIso() }
        delete users[candidate]
        return true
      }
      return false
    })
  }
  if (!user) {
    key = googleAccountUsername(users)
    user = { username: key, email: google.email, name: '', surname: '', role: 'user', spreadsheet_id: '', active: true, google_sub: google.sub, salt: '', password_hash: '', created_at: nowIso(), updated_at: nowIso() }
  }
  user.google_sub = google.sub
  users[key] = user
  saveAccountStore(ACCOUNT_USERS_PROPERTY, users)
  return newAccountSession(user)
}
function inviteAccount(p, google) {
  var spreadsheetId = String(p.spreadsheet_id || '').trim()
  if (!spreadsheetId) throw new Error('Google Sheet ID is required')
  var file = getGoogleOwnedSpreadsheet(spreadsheetId, p.google_access_token, google.email)
  setupSheets(file.id)
  var users = accountStore(ACCOUNT_USERS_PROPERTY), code = accountToken().slice(0, 12).toUpperCase()
  users['__invite__' + code] = { email: String(p.email || '').trim().toLowerCase(), role: String(p.role || 'user'), spreadsheet_id: file.id, owner_email: google.email, created_at: nowIso() }
  saveAccountStore(ACCOUNT_USERS_PROPERTY, users)
  return { status: 'ok', invite_code: code, spreadsheet_id: file.id }
}
function accountMembers(p, google) {
  var spreadsheetId = String(p.spreadsheet_id || '').trim()
  if (!spreadsheetId) throw new Error('Google Sheet ID is required')
  var file = getGoogleOwnedSpreadsheet(spreadsheetId, p.google_access_token, google.email), users = accountStore(ACCOUNT_USERS_PROPERTY), members = []
  Object.keys(users).forEach(function (key) {
    var user = users[key]
    if (key.indexOf('__invite__') === 0) {
      if (String(user.spreadsheet_id || '') === file.id && String(user.owner_email || '').toLowerCase() === google.email) members.push({ email: user.email || '', role: user.role || 'user', spreadsheet_id: file.id, status: 'pending' })
      return
    }
    if (String(user.spreadsheet_id || '') === file.id) members.push(accountPublic(user))
  })
  return { status: 'ok', members: members }
}
function accountStateSheet() {
  if (!CURRENT_ACCOUNT_USER.spreadsheet_id) throw new Error('บัญชีนี้ยังไม่ได้รับสิทธิ์ Google Sheet')
  setupSheets(CURRENT_ACCOUNT_USER.spreadsheet_id)
  return SpreadsheetApp.openById(CURRENT_ACCOUNT_USER.spreadsheet_id).getSheetByName('app_state')
}
function accountReadState() {
  var rows = accountStateSheet().getDataRange().getValues()
  for (var i = 1; i < rows.length; i++) if (String(rows[i][0]) === 'account_state' && rows[i][1]) {
    try { return { status: 'ok', state: JSON.parse(rows[i][1]) } } catch (err) { return { status: 'ok', state: null } }
  }
  return { status: 'ok', state: null }
}
function accountSaveState(state) {
  var sh = accountStateSheet(), rows = sh.getDataRange().getValues(), row = -1
  for (var i = 1; i < rows.length; i++) if (String(rows[i][0]) === 'account_state') { row = i + 1; break }
  var values = [['account_state', JSON.stringify(state || {}), nowIso()]]
  if (row < 0) sh.getRange(sh.getLastRow() + 1, 1, 1, 3).setValues(values); else sh.getRange(row, 1, 1, 3).setValues(values)
  return { status: 'ok' }
}

function doGet() {
  return json({ status: 'error', message: 'POST with a verified LINE access token is required' })
}

function doPost(e) {
  var p = {}
  try {
    var body = (e && e.postData && e.postData.contents) || '{}'
    p = JSON.parse(body)
    if (p.action === 'lineWebhookRelay') {
      return handleLineWebhookRelay(p.payload, p.relay_secret)
    }
    if (p.action === 'lineGroupCatalog') {
      return handleLineGroupCatalog(p.owner_email, '', p.relay_secret)
    }
    if (p.action === 'selectLineGroup') {
      return handleLineGroupCatalog(p.owner_email, p.group_id, p.relay_secret)
    }
    if (p && Array.isArray(p.events)) {
      return handleLineWebhook(body, p, e)
    }
    if (p.action === 'provisionUser') {
      var google = verifyGoogleIdentity(p.google_access_token)
      var provisioned = provisionUser(p, google)
      delete p.google_access_token
      return json(provisioned)
    }
    if (p.action === 'accountRegister') return json(registerAccount(p))
    if (p.action === 'accountLogin') return json(loginAccount(p))
    if (p.action === 'accountInvite') return json(inviteAccount(p, verifyGoogleIdentity(p.google_access_token)))
    if (p.action === 'accountGoogleLogin') return json(googleLoginAccount(p))
    if (p.action === 'accountMembers') return json(accountMembers(p, verifyGoogleIdentity(p.google_access_token)))
    if (p.action === 'appVersion') return json({ status: 'ok', version: PETCARE_BACKEND_VERSION })
    if (p.action === 'accountReadState' || p.action === 'accountSaveState') {
      verifyAccountSession(p.session_token)
      return json(p.action === 'accountReadState' ? accountReadState() : accountSaveState(p.state))
    }
    var token = p.access_token || extractBearer(e)
    CURRENT_LINE_USER_ID = verifyLineAccessToken(token)
    delete p.access_token
    return json(dispatch(p))
  } catch (err) {
    return json({ status: 'error', message: String(err.message || err) })
  } finally {
    CURRENT_LINE_USER_ID = ''
  }
}

function handleLineWebhookRelay(payload, relaySecret) {
  var expected = String(PropertiesService.getScriptProperties().getProperty(GAS_WEBHOOK_SECRET) || '')
  if (!expected || !constantTimeEqual(expected, String(relaySecret || ''))) throw new Error('Invalid GAS webhook relay secret')
  if (!payload || !Array.isArray(payload.events)) throw new Error('Invalid relayed LINE webhook payload')
  return processLineWebhook(payload)
}

// LINE Webhook endpoint. LINE signs the raw request body, so verification must
// happen before parsing or trusting any event data.
function handleLineWebhook(body, payload, e) {
  var signature = getHeader(e, 'X-Line-Signature')
  if (!verifyLineWebhookSignature(body, signature)) throw new Error('Invalid LINE webhook signature')
  return processLineWebhook(payload)
}

function processLineWebhook(payload) {
  var groups = []
  ;(payload.events || []).forEach(function (event) {
    var source = event && event.source
    if (!source || source.type !== 'group' || !source.groupId) return
    var group = rememberLineGroup(source.groupId, event.type)
    if (group) groups.push(group)
  })
  return json({ status: 'ok', event_count: (payload.events || []).length, group_count: groups.length })
}

function getHeader(e, name) {
  var headers = (e && e.headers) || {}
  var wanted = String(name).toLowerCase()
  return Object.keys(headers).reduce(function (value, key) {
    return String(key).toLowerCase() === wanted ? headers[key] : value
  }, '')
}

function verifyLineWebhookSignature(body, signature) {
  var secret = String(PropertiesService.getScriptProperties().getProperty(LINE_CHANNEL_SECRET) || '')
  if (!secret || !signature) return false
  var digest = Utilities.computeHmacSha256Signature(String(body || ''), secret)
  var expected = Utilities.base64Encode(digest)
  return constantTimeEqual(String(expected), String(signature))
}

function handleLineGroupCatalog(ownerEmail, selectedGroupId, relaySecret) {
  var expected = String(PropertiesService.getScriptProperties().getProperty(GAS_WEBHOOK_SECRET) || '')
  if (!expected || !constantTimeEqual(expected, String(relaySecret || ''))) throw new Error('Invalid GAS webhook relay secret')
  var email = String(ownerEmail || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Invalid Google account email')

  var props = PropertiesService.getScriptProperties()
  var groups = parseJsonProperty(props, LINE_GROUPS_PROPERTY)
  var selections = parseJsonProperty(props, LINE_GROUP_SELECTIONS_PROPERTY)
  var requestedId = String(selectedGroupId || '').trim()
  if (requestedId) {
    var requested = groups[requestedId]
    if (!requested || requested.status !== 'active') throw new Error('LINE group is not available')
    if (requested.owner_email && requested.owner_email !== email) throw new Error('LINE group is already linked to another account')
    requested.owner_email = email
    requested.updated_at = nowIso()
    groups[requestedId] = requested
    selections[email] = requestedId
    props.setProperty(LINE_GROUP_SELECTIONS_PROPERTY, JSON.stringify(selections))
    props.setProperty('TARGET_ID', requestedId)
  }

  var selectedId = String(selections[email] || '')
  var visibleGroups = Object.keys(groups).map(function (groupId) {
    var group = groups[groupId]
    if (group.owner_email && group.owner_email !== email) return null
    if (!group.group_name) {
      var summary = getLineGroupSummary(groupId)
      if (summary) {
        group.group_name = summary.groupName || ''
        group.picture_url = summary.pictureUrl || ''
        groups[groupId] = group
      }
    }
    return {
      group_id: groupId,
      group_name: group.group_name || ('LINE Group ' + groupId.slice(-6)),
      picture_url: group.picture_url || '',
      updated_at: group.updated_at || '',
      selected: groupId === selectedId,
    }
  }).filter(Boolean)
  props.setProperty(LINE_GROUPS_PROPERTY, JSON.stringify(groups))
  return json({ status: 'ok', groups: visibleGroups, selected_group_id: selectedId })
}

function parseJsonProperty(props, key) {
  try { return JSON.parse(props.getProperty(key) || '{}') || {} } catch (err) { return {} }
}

function getLineGroupSummary(groupId) {
  var token = String(PropertiesService.getScriptProperties().getProperty('LINE_TOKEN') || '')
  if (!token) return null
  try {
    var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/group/' + encodeURIComponent(groupId) + '/summary', {
      headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
    })
    if (response.getResponseCode() !== 200) return null
    return JSON.parse(response.getContentText() || '{}')
  } catch (err) {
    return null
  }
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false
  var mismatch = 0
  for (var i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return mismatch === 0
}

function rememberLineGroup(groupId, eventType) {
  var normalizedId = String(groupId || '').trim()
  if (!/^C[A-Za-z0-9_-]{20,}$/.test(normalizedId)) return null
  var props = PropertiesService.getScriptProperties()
  var groups = {}
  try { groups = JSON.parse(props.getProperty(LINE_GROUPS_PROPERTY) || '{}') || {} } catch (err) { groups = {} }
    var now = nowIso()
    var existing = groups[normalizedId] || { group_id: normalizedId, created_at: now }
    groups[normalizedId] = {
      group_id: normalizedId,
      group_name: existing.group_name || '',
      picture_url: existing.picture_url || '',
      owner_email: existing.owner_email || '',
      status: String(eventType || '') === 'leave' ? 'inactive' : 'active',
      last_event: String(eventType || ''),
    created_at: existing.created_at || now,
    updated_at: now,
  }
  props.setProperty(LINE_GROUPS_PROPERTY, JSON.stringify(groups))
  return groups[normalizedId]
}

function extractBearer(e) {
  var headers = (e && e.headers) || {}
  var value = headers.Authorization || headers.authorization || ''
  return String(value).replace(/^Bearer\s+/i, '')
}

function verifyLineAccessToken(token) {
  if (!token) throw new Error('Missing LINE access token')
  var response = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(token), { muteHttpExceptions: true })
  if (response.getResponseCode() !== 200) throw new Error('LINE access token verification failed')
  var verification = JSON.parse(response.getContentText() || '{}')
  if (!verification.expires_in || verification.expires_in <= 0) throw new Error('LINE access token is expired')
  var allowed = String(PropertiesService.getScriptProperties().getProperty(LINE_CHANNEL_IDS) || '').split(',').map(function (id) { return id.trim() }).filter(Boolean)
  if (!allowed.length || allowed.indexOf(verification.client_id) < 0) throw new Error('LINE channel is not authorized by this GAS deployment')
  var profile = UrlFetchApp.fetch('https://api.line.me/v2/profile', { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true })
  if (profile.getResponseCode() !== 200) throw new Error('LINE profile verification failed')
  var user = JSON.parse(profile.getContentText() || '{}')
  if (!user.userId) throw new Error('LINE user identity is missing')
  return user.userId
}

function dispatch(p) {
  var action = p.action || ''
  try {
    var out
    switch (action) {
      case 'readSheet':      out = readSheet(p.sheet); break
      case 'addPet':         out = upsertRow('pets', p, true); break
      case 'linkGoogleSheet': out = linkGoogleSheet(p); break
      case 'editPet':        out = upsertRow('pets', p, false); break
      case 'deletePet':      out = softDelete('pets', p.id); break

      case 'addLog':         out = upsertRow('logs', p, true); break
      case 'editLog':        out = upsertRow('logs', p, false); break
      case 'deleteLog':      out = deleteRow('logs', p.id); break

      case 'addSchedule':    out = saveSchedule(p, true); break
      case 'editSchedule':   out = saveSchedule(p, false); break
      case 'deleteSchedule': out = softDelete('med_schedules', p.id); break

      case 'markMedTaken':   out = markMedTaken(p); break

      case 'addLogType':     out = upsertRow('log_types', p, true, 'key'); break
      case 'editLogType':    out = upsertRow('log_types', p, false, 'key'); break

      case 'testPush':
        if (!isLineAdmin(CURRENT_LINE_USER_ID)) throw new Error('LINE test push is admin-only')
        out = sendLine('🐶 ทดสอบแจ้งเตือน PetCare', getAllRecipients())
        break

      default: out = { status: 'error', message: 'unknown action: ' + action }
    }
    return out
  } catch (err) {
    return { status: 'error', message: String(err) }
  }
}

function isLineAdmin(userId) {
  return String(PropertiesService.getScriptProperties().getProperty(LINE_ADMIN_USER_IDS) || '')
    .split(',').map(function (id) { return id.trim() }).filter(Boolean).indexOf(userId) >= 0
}

// ── generic row helpers ────────────────────────────────────────────────────
function getSheet(name) {
  var sh = getSpreadsheet().getSheetByName(name)
  if (!sh) throw new Error('ไม่พบชีต ' + name + ' — รัน setupSheets() ก่อน')
  return sh
}

function readHeaders(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
}

function readSheet(name) {
  if (!name || !SHEETS[name]) throw new Error('invalid sheet')
  var sh = getSheet(name)
  if (sh.getLastRow() <= 1) return { status: 'ok', rows: [] }
  var headers = readHeaders(sh)
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues()
  return { status: 'ok', rows: values.map(function (row) { return rowToObj(headers, row) }) }
}

// เพิ่มหรือแก้แถวตาม id (หรือ key) — เขียนเฉพาะคอลัมน์ที่ส่งมา
function upsertRow(name, p, isNew, idCol) {
  idCol = idCol || 'id'
  var sh = getSheet(name)
  var headers = readHeaders(sh)
  var idIdx = headers.indexOf(idCol)

  if (isNew) {
    if (!p[idCol]) p[idCol] = idCol + '_' + Date.now()
    if (headers.indexOf('created_at') >= 0 && !p.created_at) p.created_at = nowIso()
    if (headers.indexOf('active') >= 0 && !p.active) p.active = 'TRUE'
    var row = headers.map(function (h) { return p[h] !== undefined ? p[h] : '' })
    sh.appendRow(row)
    return { status: 'ok', id: p[idCol] }
  }

  // edit: หาแถวตาม id
  var ids = sh.getRange(2, idIdx + 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues()
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(p[idCol])) {
      var r = i + 2
      headers.forEach(function (h, c) {
        if (p[h] !== undefined && h !== idCol && h !== 'created_at') {
          sh.getRange(r, c + 1).setValue(p[h])
        }
      })
      return { status: 'ok', id: p[idCol] }
    }
  }
  return { status: 'error', message: 'ไม่พบ id ' + p[idCol] }
}

function softDelete(name, id) {
  var sh = getSheet(name)
  var headers = readHeaders(sh)
  var idIdx = headers.indexOf('id')
  var actIdx = headers.indexOf('active')
  var data = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), headers.length).getValues()
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(id)) {
      if (actIdx >= 0) { sh.getRange(i + 2, actIdx + 1).setValue('FALSE'); return { status: 'ok' } }
      sh.deleteRow(i + 2); return { status: 'ok' }
    }
  }
  return { status: 'error', message: 'ไม่พบ id ' + id }
}

function deleteRow(name, id) {
  var sh = getSheet(name)
  var headers = readHeaders(sh)
  var idIdx = headers.indexOf('id')
  var data = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), headers.length).getValues()
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(id)) { sh.deleteRow(i + 2); return { status: 'ok' } }
  }
  return { status: 'error', message: 'ไม่พบ id ' + id }
}

// ── schedule / medication ──────────────────────────────────────────────────
function saveSchedule(p, isNew) {
  // คำนวณ next_due ตอนเซฟ เพื่อโชว์ใน UI
  p.next_due = computeNextDue(p, today())
  return upsertRow('med_schedules', p, isNew)
}

// บันทึกว่า "กินยาแล้ว" → เพิ่ม log type med + อัปเดต last_done/next_due
function markMedTaken(p) {
  var sh = getSheet('med_schedules')
  var headers = readHeaders(sh)
  var idIdx = headers.indexOf('id')
  var data = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), headers.length).getValues()
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(p.id)) {
      var rec = rowToObj(headers, data[i])
      var r = i + 2
      var d = today()
      sh.getRange(r, headers.indexOf('last_done') + 1).setValue(d)
      // next_due หลังจากวันนี้
      var tomorrow = addDays(parseDate(d), 1)
      sh.getRange(r, headers.indexOf('next_due') + 1).setValue(computeNextDue(rec, fmtDate(tomorrow)))
      // เขียน log
      upsertRow('logs', {
        pet_id: rec.pet_id, type: 'med',
        datetime: nowIso(),
        detail: rec.med_name + (rec.dose ? ' (' + rec.dose + ')' : ''),
      }, true)
      return { status: 'ok' }
    }
  }
  return { status: 'error', message: 'ไม่พบ schedule ' + p.id }
}

// ── reminder engine (trigger รายชั่วโมง) ───────────────────────────────────
function checkReminders() {
  var props = PropertiesService.getScriptProperties().getProperties()
  Object.keys(props).filter(function (key) { return key.indexOf(USER_SHEET_PREFIX) === 0 }).forEach(function (key) {
    CURRENT_LINE_USER_ID = key.slice(USER_SHEET_PREFIX.length)
    try { checkRemindersForCurrentUser() } catch (err) { Logger.log('Reminder user run failed: ' + err.message) }
  })
  CURRENT_LINE_USER_ID = ''
}

function checkRemindersForCurrentUser() {
  var ss = getSpreadsheet()
  checkLegacyMedicationSchedules(ss)
  checkNormalizedReminders(ss)
}

function checkLegacyMedicationSchedules(ss) {
  var sh = ss.getSheetByName('med_schedules')
  if (!sh || sh.getLastRow() <= 1) return
  var headers = readHeaders(sh)
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues()

  var petName = buildPetNameMap()
  var nowHour = new Date().getHours()
  var todayStr = today()

  rows.forEach(function (raw) {
    var s = rowToObj(headers, raw)
    if (String(s.active).toUpperCase() === 'FALSE') return
    // ชั่วโมงต้องตรงกับเวลาที่ตั้ง (trigger รันรายชั่วโมง)
    var schedHour = parseInt(String(s.time || '08:00').split(':')[0], 10)
    if (isNaN(schedHour)) schedHour = 8
    if (nowHour !== schedHour) return
    if (!isScheduledOn(s, todayStr)) return

    var name = petName[s.pet_id] || 'สัตว์เลี้ยง'
    var msg = '💊 ถึงเวลาให้ยา ' + name + ': ' + s.med_name +
              (s.dose ? ' (' + s.dose + ')' : '')
    var recipients = getReminderRecipients(s.id)
    if (!recipients.length) {
      Logger.log('Reminder skipped: no recipients configured for current user and reminder')
      return
    }
    sendLine(msg, recipients)
  })
}

// New PetCare web app reminders are stored in the normalized `reminders` tab.
// The UI currently stores a date (not a time), so these reminders are sent at
// 08:00 in the Apps Script project timezone when the hourly trigger runs.
function checkNormalizedReminders(ss) {
  var sh = ss.getSheetByName('reminders')
  if (!sh || sh.getLastRow() <= 1) return
  var headers = readHeaders(sh)
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues()
  var petName = buildPetNameMap()
  var nowHour = new Date().getHours()
  var todayStr = today()
  rows.forEach(function (raw) {
    var reminder = rowToObj(headers, raw)
    if (!reminder.id || String(reminder.active).toUpperCase() === 'FALSE') return
    if (!isNormalizedReminderDue(reminder, todayStr)) return
    var reminderConfig = parseConfig(reminder.schedule_config)
    var configuredHour = parseInt(String(reminderConfig.time || '08:00').split(':')[0], 10)
    if (isNaN(configuredHour)) configuredHour = 8
    if (nowHour !== configuredHour) return

    var recipients = getReminderRecipients(reminder.id)
    if (!recipients.length) {
      Logger.log('Reminder skipped: no recipients configured for normalized reminder ' + reminder.id)
      return
    }
    var name = petName[reminder.pet_id] || 'สัตว์เลี้ยง'
    var msg = '🔔 ถึงเวลา: ' + reminder.title + ' (' + name + ')' +
      (reminder.detail ? '\n' + reminder.detail : '')
    sendLine(msg, recipients)
  })
}

function isNormalizedReminderDue(reminder, dateStr) {
  var config = parseConfig(reminder.schedule_config)
  var start = String(config.date || reminder.start_at || '').slice(0, 10)
  if (!start || dateStr < start) return false
  var frequency = String(config.frequency || reminder.schedule_type || '').trim()
  if (frequency === 'once' || frequency === 'ครั้งเดียว') return dateStr === start
  if (frequency === 'ทุกวัน' || frequency === 'daily') return true

  var date = parseDate(dateStr)
  var startDate = parseDate(start)
  if (frequency === 'recurring' || frequency === 'custom') {
    var interval = Math.max(parseInt(config.interval, 10) || 1, 1)
    var unit = String(config.unit || 'day').toLowerCase()
    if (unit === 'day') {
      return Math.round((date - startDate) / 86400000) % interval === 0
    }
    if (unit === 'month') {
      var monthsSinceStart = (date.getFullYear() - startDate.getFullYear()) * 12 + date.getMonth() - startDate.getMonth()
      var monthDay = config.monthMode === 'fixed_day' ? config.day : startDate.getDate()
      return monthsSinceStart >= 0 && monthsSinceStart % interval === 0 && date.getDate() === clampDay(monthDay, date)
    }
    if (unit === 'year') {
      var yearsSinceStart = date.getFullYear() - startDate.getFullYear()
      return yearsSinceStart >= 0 && yearsSinceStart % interval === 0 && date.getMonth() === startDate.getMonth() && date.getDate() === clampDay(startDate.getDate(), date)
    }
  }
  if (frequency === 'ทุกสัปดาห์' || frequency === 'weekly') {
    return Math.round((date - startDate) / 86400000) % 7 === 0
  }
  if (frequency === 'ทุกเดือน' || frequency === 'monthly') {
    return date.getDate() === clampDay(startDate.getDate(), date)
  }
  if (frequency === 'ทุก 3 เดือน' || frequency === 'every_3_months') {
    var months = (date.getFullYear() - startDate.getFullYear()) * 12 + date.getMonth() - startDate.getMonth()
    return months % 3 === 0 && date.getDate() === clampDay(startDate.getDate(), date)
  }
  if (frequency === 'ทุกปี' || frequency === 'yearly') {
    return date.getMonth() === startDate.getMonth() && date.getDate() === startDate.getDate()
  }
  return false
}

function getReminderRecipients(reminderId) {
  var sh = getSpreadsheet().getSheetByName('reminder_recipients')
  if (!sh || sh.getLastRow() <= 1) return selectedLineGroupRecipient()
  var headers = readHeaders(sh), reminderIdx = headers.indexOf('reminder_id'), recipientIdx = headers.indexOf('recipient_id')
  var recipients = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues()
    .filter(function (row) {
      var target = String(row[reminderIdx] || '').trim()
      return target === '' || target === '*' || target === String(reminderId)
    })
    .map(function (row) { return String(row[recipientIdx] || '').trim() }).filter(Boolean)
  return recipients.length ? recipients : selectedLineGroupRecipient()
}

function getAllRecipients() {
  var sh = getSpreadsheet().getSheetByName('reminder_recipients')
  if (!sh || sh.getLastRow() <= 1) return selectedLineGroupRecipient()
  var headers = readHeaders(sh), recipientIdx = headers.indexOf('recipient_id')
  var recipients = sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues()
    .map(function (row) { return String(row[recipientIdx] || '').trim() }).filter(Boolean)
  return recipients.length ? recipients : selectedLineGroupRecipient()
}

function selectedLineGroupRecipient() {
  var target = String(PropertiesService.getScriptProperties().getProperty('TARGET_ID') || '').trim()
  return target ? [target] : []
}

function buildPetNameMap() {
  var map = {}
  var sh = getSpreadsheet().getSheetByName('pets')
  if (!sh || sh.getLastRow() <= 1) return map
  var headers = readHeaders(sh)
  var idIdx = headers.indexOf('id'), nameIdx = headers.indexOf('name')
  sh.getRange(2, 1, sh.getLastRow() - 1, headers.length).getValues().forEach(function (r) {
    map[r[idIdx]] = r[nameIdx]
  })
  return map
}

// ── schedule logic (ใช้ร่วมกับ frontend src/schedule.js) ───────────────────
// today/tomorrow เป็น string 'YYYY-MM-DD'
function isScheduledOn(s, dateStr) {
  var cfg = parseConfig(s.config)
  var d = parseDate(dateStr)
  var start = parseDate(s.start_date || dateStr)
  if (d < start) return false
  switch (s.schedule_type) {
    case 'daily':
      return true
    case 'monthly':
      return d.getDate() === clampDay(cfg.day || 1, d)
    case 'every_n_months': {
      var months = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth())
      var n = Math.max(parseInt(cfg.months, 10) || 1, 1)
      return (months % n === 0) && d.getDate() === clampDay(cfg.day || start.getDate(), d)
    }
    case 'cycle': {
      var on = Math.max(parseInt(cfg.on, 10) || 1, 1)
      var off = Math.max(parseInt(cfg.off, 10) || 0, 0)
      var period = on + off
      var days = Math.round((d - start) / 86400000)
      return (days % period) < on
    }
    default:
      return false
  }
}

// หาวันถัดไป (รวม fromStr) ที่ตรงเงื่อนไข — คืน 'YYYY-MM-DD' หรือ '' ถ้าหาไม่เจอใน 366 วัน
function computeNextDue(s, fromStr) {
  var d = parseDate(fromStr)
  for (var i = 0; i < 366; i++) {
    var ds = fmtDate(d)
    if (isScheduledOn(s, ds)) return ds
    d = addDays(d, 1)
  }
  return ''
}

function parseConfig(c) {
  if (!c) return {}
  if (typeof c === 'object') return c
  try { return JSON.parse(c) } catch (e) { return {} }
}

function clampDay(day, d) {
  var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return Math.min(parseInt(day, 10) || 1, last)
}

// ── LINE push ──────────────────────────────────────────────────────────────
function sendLine(text, recipients) {
  var props = PropertiesService.getScriptProperties()
  var token = props.getProperty('LINE_TOKEN')
  if (!token || !recipients || !recipients.length) {
    throw new Error('LINE delivery unavailable: configure token and per-user recipients')
  }
  var deliveries = []
  recipients.forEach(function (to) {
    var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true,
    })
    var code = response.getResponseCode()
    var body = response.getContentText() || ''
    deliveries.push({ status: code >= 200 && code < 300 ? 'sent' : 'error', response_code: code })
    if (code < 200 || code >= 300) Logger.log('LINE push provider failure status=' + code + ' body=' + body)
  })
  var failed = deliveries.filter(function (item) { return item.status === 'error' })
  if (failed.length) throw new Error('LINE delivery failed for ' + failed.length + ' recipient(s)')
  return { status: 'ok', delivery_count: deliveries.length }
}

// ── date utils ─────────────────────────────────────────────────────────────
function today() { return fmtDate(new Date()) }
function nowIso() {
  var d = new Date(), p = function (n) { return ('0' + n).slice(-2) }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    'T' + p(d.getHours()) + ':' + p(d.getMinutes())
}
function fmtDate(d) { var p = function (n) { return ('0' + n).slice(-2) }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) }
function parseDate(s) { var a = String(s).split('-'); return new Date(+a[0], (+a[1] || 1) - 1, +a[2] || 1) }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n) }

function rowToObj(headers, row) {
  var o = {}; headers.forEach(function (h, i) { o[h] = row[i] }); return o
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}
