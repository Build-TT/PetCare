/**
 * PetCare — Google Apps Script backend
 * ────────────────────────────────────────────────────────────────────────
 * หน้าที่:
 *   1) เป็น web app รับคำสั่งเขียนข้อมูลจาก frontend (doGet → action)
 *   2) checkReminders() ผูกกับ time-driven trigger รายชั่วโมง → ส่ง LINE push
 *
 * วิธีติดตั้ง (ดู README.md ประกอบ):
 *   1. เปิด Google Sheet ใหม่ → Extensions → Apps Script → วางไฟล์นี้
 *   2. รันฟังก์ชัน setupSheets() หนึ่งครั้ง เพื่อสร้าง tab + headers + seed log_types
 *   3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone
 *      → คัดลอก URL ไปใส่ VITE_GAS_URL
 *   4. ตั้งค่า Script Properties (Project Settings → Script Properties):
 *        LINE_TOKEN = channel access token ของ Messaging API
 *        TARGET_ID  = group id หรือ user id (หลายคนคั่นด้วย comma)
 *   5. รัน installReminderTrigger() หนึ่งครั้ง เพื่อสร้าง trigger รายชั่วโมง
 */

var SHEETS = {
  pets: ['id', 'name', 'species', 'breed', 'birthdate', 'photo', 'color', 'active', 'order', 'created_at'],
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
  treatment_history: ['id', 'pet_id', 'category', 'title', 'started_at', 'ended_at', 'clinic', 'note', 'created_at', 'updated_at'],
  reminders: ['id', 'pet_id', 'type', 'title', 'schedule_type', 'schedule_config', 'start_at', 'end_at', 'active', 'created_at', 'updated_at'],
  reminder_recipients: ['id', 'reminder_id', 'recipient_id', 'created_at'],
  reminder_deliveries: ['id', 'reminder_id', 'recipient_id', 'scheduled_at', 'status', 'response_code', 'created_at'],
  audit_events: ['id', 'pet_id', 'actor_email', 'action', 'entity_type', 'entity_id', 'created_at'],
}

var PETCARE_SPREADSHEET_ID = 'PETCARE_SPREADSHEET_ID'
var GAS_WEBHOOK_SECRET = 'GAS_WEBHOOK_SECRET'
var LINE_GROUPS_PROPERTY = 'PETCARE_LINE_GROUPS'
var LINE_GROUP_SELECTIONS_PROPERTY = 'PETCARE_LINE_GROUP_SELECTIONS'

var DEFAULT_LOG_TYPES = [
  ['med',     'ให้ยา',       'Medicine', '💊', 'FALSE', 'TRUE', '1'],
  ['pee',     'ฉี่',         'Pee',      '💧', 'FALSE', 'TRUE', '2'],
  ['poop',    'ขี้',         'Poop',     '💩', 'FALSE', 'TRUE', '3'],
  ['vaccine', 'วัคซีน',      'Vaccine',  '💉', 'TRUE',  'TRUE', '4'],
  ['checkup', 'ตรวจสุขภาพ',  'Checkup',  '🩺', 'TRUE',  'TRUE', '5'],
  ['symptom', 'อาการ',       'Symptom',  '🤒', 'TRUE',  'TRUE', '6'],
]

// ── สร้าง tab + headers + seed (รันครั้งเดียวตอนติดตั้ง) ───────────────────
function setupSheets() {
  var ss = getSpreadsheet()
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

function getSpreadsheet() {
  var id = PropertiesService.getScriptProperties().getProperty(PETCARE_SPREADSHEET_ID)
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet()
}

function connectSpreadsheet(p) {
  var url = String((p && p.spreadsheet_url) || '')
  var match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) || url.match(/^([a-zA-Z0-9-_]{20,})$/)
  if (!match) return { status: 'error', message: 'invalid spreadsheet URL' }
  var id = match[1]
  var ss
  try {
    ss = SpreadsheetApp.openById(id)
  } catch (err) {
    return { status: 'error', message: 'spreadsheet is not shared with this Apps Script account' }
  }
  PropertiesService.getScriptProperties().setProperty(PETCARE_SPREADSHEET_ID, id)
  setupSheets()
  return { status: 'ok', spreadsheet_id: ss.getId(), spreadsheet_name: ss.getName() }
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
function doGet(e) {
  var p = (e && e.parameter) || {}
  var action = p.action || ''
  try {
    var out
    switch (action) {
      case 'addPet':         out = upsertRow('pets', p, true); break
      case 'connectSpreadsheet': out = connectSpreadsheet(p); break
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

      case 'testPush':       sendLine('🐶 ทดสอบแจ้งเตือน PetCare'); out = { status: 'ok' }; break

      default: out = { status: 'error', message: 'unknown action: ' + action }
    }
    return json(out)
  } catch (err) {
    return json({ status: 'error', message: String(err) })
  }
}

// Vercel verifies LINE's X-Line-Signature against the raw request body, then
// relays the parsed payload here with a separate shared secret. This avoids the
// redirect returned by Apps Script ContentService being exposed to LINE.
function doPost(e) {
  try {
    var body = (e && e.postData && e.postData.contents) || '{}'
    var p = JSON.parse(body)
    if (p.action === 'lineWebhookRelay') return handleLineWebhookRelay(p.payload, p.relay_secret)
    if (p.action === 'lineGroupCatalog') return handleLineGroupCatalog(p.owner_email, '', p.relay_secret)
    if (p.action === 'selectLineGroup') return handleLineGroupCatalog(p.owner_email, p.group_id, p.relay_secret)
    return json({ status: 'error', message: 'unknown POST action' })
  } catch (err) {
    return json({ status: 'error', message: String(err.message || err) })
  }
}

function verifyGasRelaySecret(relaySecret) {
  var expected = String(PropertiesService.getScriptProperties().getProperty(GAS_WEBHOOK_SECRET) || '')
  if (!expected || !constantTimeEqual(expected, String(relaySecret || ''))) {
    throw new Error('Invalid GAS webhook relay secret')
  }
}

function handleLineWebhookRelay(payload, relaySecret) {
  verifyGasRelaySecret(relaySecret)
  if (!payload || !Array.isArray(payload.events)) {
    throw new Error('Invalid relayed LINE webhook payload')
  }

  var groups = []
  payload.events.forEach(function (event) {
    var source = event && event.source
    if (!source || source.type !== 'group' || !source.groupId) return
    var group = rememberLineGroup(source.groupId, event.type)
    if (group) groups.push(group)
  })
  return json({ status: 'ok', event_count: payload.events.length, group_count: groups.length })
}

function handleLineGroupCatalog(ownerEmail, selectedGroupId, relaySecret) {
  verifyGasRelaySecret(relaySecret)
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
    props.setProperty(LINE_GROUPS_PROPERTY, JSON.stringify(groups))
    props.setProperty(LINE_GROUP_SELECTIONS_PROPERTY, JSON.stringify(selections))
    // Keep the existing reminder trigger functional while recipient-per-sheet
    // delivery is introduced incrementally.
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
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
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
  for (var i = 0; i < left.length; i++) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i)
  }
  return mismatch === 0
}

function rememberLineGroup(groupId, eventType) {
  var normalizedId = String(groupId || '').trim()
  if (!/^C[A-Za-z0-9_-]{20,}$/.test(normalizedId)) return null

  var props = PropertiesService.getScriptProperties()
  var groups = {}
  try {
    groups = JSON.parse(props.getProperty(LINE_GROUPS_PROPERTY) || '{}') || {}
  } catch (err) {
    groups = {}
  }

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

// ── generic row helpers ────────────────────────────────────────────────────
function getSheet(name) {
  var sh = getSpreadsheet().getSheetByName(name)
  if (!sh) throw new Error('ไม่พบชีต ' + name + ' — รัน setupSheets() ก่อน')
  return sh
}

function readHeaders(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
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
  var ss = getSpreadsheet()
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
    sendLine(msg)
  })
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
function sendLine(text) {
  var props = PropertiesService.getScriptProperties()
  var token = props.getProperty('LINE_TOKEN')
  var target = props.getProperty('TARGET_ID')
  if (!token || !target) {
    Logger.log('ยังไม่ได้ตั้ง LINE_TOKEN / TARGET_ID')
    return
  }
  target.split(',').map(function (s) { return s.trim() }).filter(Boolean).forEach(function (to) {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: to, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true,
    })
  })
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
