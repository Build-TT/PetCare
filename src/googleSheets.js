export const PETCARE_SHEETS = {
  pets: ['id', 'name', 'species', 'gender', 'breed', 'birthdate', 'photo', 'color', 'active', 'order', 'created_at'],
  log_types: ['key', 'label_th', 'label_en', 'icon', 'needs_detail', 'active', 'order'],
  logs: ['id', 'pet_id', 'type', 'datetime', 'detail', 'created_at'],
  med_schedules: ['id', 'pet_id', 'med_name', 'dose', 'schedule_type', 'config', 'time', 'start_date', 'last_done', 'next_due', 'active', 'created_at'],
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

const SHEETS_API = 'https://sheets.googleapis.com/v4'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const NORMALIZED_SCHEMA_VERSION = 1
const NORMALIZED_STATE_SHEETS = [
  'pets',
  'tracking_items',
  'tracking_versions',
  'symptom_catalog',
  'symptom_logs',
  'diary_logs',
  'activity_logs',
  'treatment_history',
  'reminders',
  'reminder_recipients',
]

export function buildPetCareSheetTitle(email) {
  return `PetCare - ${String(email).trim()}`
}

export function encodeAppState(state) {
  return {
    key: 'ui_state',
    value: JSON.stringify(state),
    updated_at: new Date().toISOString(),
  }
}

async function apiFetch(url, options = {}) {
  let response
  try {
    response = await fetch(url, options)
  } catch (error) {
    throw new Error(`Google API network error at ${new URL(url).pathname}: ${error.message}`, { cause: error })
  }
  if (!response.ok) {
    let message = `Google API error (${response.status})`
    try { message = (await response.json()).error?.message || message } catch { /* keep generic message */ }
    throw new Error(`${message} [${response.status} ${new URL(url).pathname}]`)
  }
  return response.status === 204 ? null : response.json()
}

function authHeaders(accessToken) {
  if (!accessToken) throw new Error('Google access token is missing; please reconnect Google')
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

async function initializeSchema(accessToken, spreadsheet) {
  const names = Object.keys(PETCARE_SHEETS)
  const existingNames = new Set((spreadsheet.sheets || []).map((sheet) => sheet.properties?.title).filter(Boolean))
  const requests = []
  names.forEach((name) => {
    if (!existingNames.has(name)) requests.push({ addSheet: { properties: { title: name } } })
  })
  if (requests.length > 0) {
    await apiFetch(`${SHEETS_API}/spreadsheets/${spreadsheet.spreadsheetId}:batchUpdate`, {
      method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({ requests }),
    })
  }
  const ranges = names.map((name) => encodeURIComponent(`${name}!1:1`)).join('&ranges=')
  const headerData = await apiFetch(`${SHEETS_API}/spreadsheets/${spreadsheet.spreadsheetId}/values:batchGet?ranges=${ranges}`, {
    headers: authHeaders(accessToken),
  })
  const updates = []
  names.forEach((name, index) => {
    const existing = headerData.valueRanges?.[index]?.values?.[0] || []
    if (existing.length === 0) {
      updates.push({ range: `${name}!A1`, majorDimension: 'ROWS', values: [PETCARE_SHEETS[name]] })
      return
    }
    PETCARE_SHEETS[name].forEach((header) => {
      if (existing.includes(header)) return
      const column = existing.length + 1
      existing.push(header)
      updates.push({ range: `${name}!${columnName(column)}1`, majorDimension: 'ROWS', values: [[header]] })
    })
  })
  if (updates.length === 0) return
  await apiFetch(`${SHEETS_API}/spreadsheets/${spreadsheet.spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: updates,
    }),
  })
}

function columnName(number) {
  let value = number
  let result = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}

export async function createOrFindPetCareSheet(accessToken, email, preferredSpreadsheetId = '', options = {}) {
  const createNew = options.createNew === true
  const title = createNew ? `PetCare Production - ${String(email).trim()}` : buildPetCareSheetTitle(email)
  if (!createNew && preferredSpreadsheetId) {
    try {
      const file = await apiFetch(`${DRIVE_API}/files/${encodeURIComponent(preferredSpreadsheetId)}?fields=id,name,mimeType,webViewLink`, { headers: authHeaders(accessToken) })
      if (file?.mimeType === 'application/vnd.google-apps.spreadsheet') {
        const spreadsheet = await apiFetch(`${SHEETS_API}/spreadsheets/${encodeURIComponent(file.id)}?fields=spreadsheetId,spreadsheetUrl,sheets.properties`, { headers: authHeaders(accessToken) })
        await initializeSchema(accessToken, spreadsheet)
        return {
          spreadsheetId: file.id,
          spreadsheetUrl: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`,
          created: false,
          name: file.name,
        }
      }
    } catch {
      // The cached file may have been deleted or access may have been revoked.
    }
  }
  const query = encodeURIComponent(`name = '${title.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`)
  if (createNew) {
    const spreadsheet = await apiFetch(`${SHEETS_API}/spreadsheets`, {
      method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({ properties: { title } }),
    })
    await initializeSchema(accessToken, spreadsheet)
    return {
      spreadsheetId: spreadsheet.spreadsheetId,
      spreadsheetUrl: spreadsheet.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}/edit`,
      created: true,
      name: title,
    }
  }
  const existing = await apiFetch(`${DRIVE_API}/files?q=${query}&spaces=drive&orderBy=modifiedTime%20desc&pageSize=10&fields=files(id,name,webViewLink)`, { headers: authHeaders(accessToken) })
  if (existing.files?.[0]) {
    const file = existing.files[0]
    const spreadsheet = await apiFetch(`${SHEETS_API}/spreadsheets/${encodeURIComponent(file.id)}?fields=spreadsheetId,spreadsheetUrl,sheets.properties`, { headers: authHeaders(accessToken) })
    await initializeSchema(accessToken, spreadsheet)
    return { spreadsheetId: file.id, spreadsheetUrl: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`, created: false, name: file.name }
  }

  const spreadsheet = await apiFetch(`${SHEETS_API}/spreadsheets`, {
    method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({ properties: { title } }),
  })
  await initializeSchema(accessToken, spreadsheet)
  return {
    spreadsheetId: spreadsheet.spreadsheetId,
    spreadsheetUrl: spreadsheet.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}/edit`,
    created: true,
    name: title,
  }
}

export async function loadAppState(accessToken, spreadsheetId) {
  const range = encodeURIComponent('app_state!A2:C')
  const data = await apiFetch(`${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${range}`, { headers: authHeaders(accessToken) })
  const row = (data.values || []).find((values) => values[0] === 'account_state') || (data.values || []).find((values) => values[0] === 'ui_state')
  if (!row?.[1]) return null
  try { return JSON.parse(row[1]) } catch { return null }
}

export async function saveAppState(accessToken, spreadsheetId, state) {
  const row = encodeAppState(state)
  const range = encodeURIComponent('app_state!A2:C2')
  await apiFetch(`${SHEETS_API}/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`, {
    method: 'PUT', headers: authHeaders(accessToken), body: JSON.stringify({ range: 'app_state!A2:C2', majorDimension: 'ROWS', values: [[row.key, row.value, row.updated_at]] }),
  })
  return row
}

function asBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (value === '' || value === null || value === undefined) return fallback
  return String(value).toUpperCase() !== 'FALSE'
}

function safeJson(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return fallback }
}

function stableId(prefix, value) {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`
}

function rowObject(headers, values) {
  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
}

function normalizedRowsFromState(state, timestamp = new Date().toISOString()) {
  const pets = (state.pets || []).map(pet => ({
    ...pet,
    active: pet.active === undefined ? true : pet.active,
    order: pet.order ?? '',
    created_at: pet.created_at || timestamp,
  }))
  const trackingItems = (state.tracks || []).map(track => ({
    id: track.id,
    pet_id: track.pet_id || '',
    name: track.name || '',
    active: track.active !== false,
    created_at: track.created_at || timestamp,
    updated_at: track.updated_at || timestamp,
  }))
  const trackingVersions = (state.tracks || []).flatMap(track => {
    const currentId = track.version_id || `${track.id}_current`
    const versions = Array.isArray(track.versions) ? track.versions.map(version => ({ ...version })) : []
    const currentIndex = versions.findIndex(version => String(version.id) === String(currentId))
    const current = {
      ...(currentIndex >= 0 ? versions[currentIndex] : {}),
      id: currentId,
      tracking_item_id: track.id,
      pet_id: track.pet_id || versions[currentIndex]?.pet_id || '',
      name: track.version_name || versions[currentIndex]?.name || track.name || '',
      dose: track.dose ?? versions[currentIndex]?.dose ?? '',
      schedule_type: track.schedule_type || versions[currentIndex]?.schedule_type || 'display',
      schedule_config: track.schedule_config || versions[currentIndex]?.schedule_config || { display: track.schedule || '' },
      start_at: track.start_at ?? versions[currentIndex]?.start_at ?? '',
      end_at: track.end_at ?? versions[currentIndex]?.end_at ?? '',
      active: track.version_active ?? versions[currentIndex]?.active ?? track.active !== false,
      created_at: track.version_created_at || versions[currentIndex]?.created_at || timestamp,
      updated_at: track.version_updated_at || versions[currentIndex]?.updated_at || timestamp,
    }
    if (currentIndex >= 0) versions[currentIndex] = current
    else versions.push(current)
    return versions.map(version => ({
      id: version.id,
      tracking_item_id: version.tracking_item_id || track.id,
      pet_id: version.pet_id || track.pet_id || '',
      name: version.name || track.name || '',
      dose: version.dose || '',
      schedule_type: version.schedule_type || 'display',
      schedule_config: JSON.stringify(safeJson(version.schedule_config, version.schedule_config || { display: '' })),
      start_at: version.start_at || '',
      end_at: version.end_at || '',
      active: version.active !== false,
      created_at: version.created_at || timestamp,
      updated_at: version.updated_at || timestamp,
    }))
  })
  const symptomCatalog = (state.symptoms || []).map(symptom => {
    const labelTh = typeof symptom === 'string' ? symptom : (symptom.label_th || symptom.label || '')
    const stableLabel = labelTh || symptom.label_en || ''
    return {
      id: typeof symptom === 'string' ? stableId('symptom', stableLabel) : (symptom.id || stableId('symptom', stableLabel)),
      pet_id: typeof symptom === 'string' ? '' : (symptom.pet_id || ''),
      label_th: labelTh,
      label_en: typeof symptom === 'string' ? '' : (symptom.label_en || ''),
      active: typeof symptom === 'string' ? true : symptom.active !== false,
      created_at: typeof symptom === 'string' ? timestamp : (symptom.created_at || timestamp),
      updated_at: typeof symptom === 'string' ? timestamp : (symptom.updated_at || timestamp),
    }
  }).filter(symptom => symptom.label_th || symptom.label_en)
  const symptomLogs = (state.logs || []).filter(log => log.symptom_log_present !== false).map(log => ({
    id: log.id,
    pet_id: log.pet_id || '',
    occurred_at: log.datetime || log.occurred_at || '',
    symptoms_json: JSON.stringify(log.symptoms || String(log.symptom || '').split(',').map(value => value.trim()).filter(Boolean)),
    diary_text: log.diary_text ?? log.diary ?? '',
    tracking_snapshot_json: JSON.stringify(log.tracks || []),
    created_at: log.created_at || timestamp,
    updated_at: log.updated_at || timestamp,
  }))
  const diaryLogs = (state.logs || []).filter(log => {
    if (log.diary_log_present === false) return false
    if (log.diary_log_present === true) return true
    return String(log.diary_log_text ?? log.diary ?? '').trim().length > 0
  }).map(log => ({
    id: log.id,
    pet_id: log.pet_id || '',
    occurred_at: log.datetime || log.occurred_at || '',
    text: log.diary_log_text ?? log.diary ?? '',
    created_at: log.diary_created_at || log.created_at || timestamp,
    updated_at: log.diary_updated_at || log.updated_at || timestamp,
  }))
  const activityLogs = (state.activities || []).map(activity => ({
    id: activity.id,
    pet_id: activity.pet_id || '',
    activity_type: activity.activity_type || activity.symptom || '',
    occurred_at: activity.datetime || activity.occurred_at || '',
    duration_minutes: activity.duration_minutes ?? '',
    weight_kg: activity.weight_kg ?? '',
    note: activity.note || activity.diary || '',
    created_at: activity.created_at || timestamp,
    updated_at: activity.updated_at || timestamp,
  }))
  const treatmentHistory = (state.treatmentHistory || []).map(item => ({
    id: item.id,
    pet_id: item.pet_id || '',
    category: item.category || '',
    title: item.title || '',
    started_at: item.started_at || '',
    ended_at: item.ended_at || '',
    clinic: item.clinic || '',
    doctor: item.doctor || '',
    note: item.note || '',
    created_at: item.created_at || timestamp,
    updated_at: item.updated_at || timestamp,
  }))
  const reminders = (state.reminders || []).map(reminder => ({
    id: reminder.id,
    pet_id: reminder.pet_id || '',
    type: reminder.type || 'main_app',
    title: reminder.title || '',
    schedule_type: reminder.schedule_type || 'display',
    schedule_config: JSON.stringify(reminder.schedule_config || { detail: reminder.detail || '' }),
    start_at: reminder.start_at || '',
    end_at: reminder.end_at || '',
    active: reminder.enabled !== undefined ? reminder.enabled : reminder.active !== false,
    created_at: reminder.created_at || timestamp,
    updated_at: reminder.updated_at || timestamp,
  }))
  const reminderRecipients = (state.lineRecipients || []).map(recipient => ({
    id: recipient.id,
    reminder_id: recipient.reminder_id || '*',
    recipient_id: recipient.recipient_id || '',
    created_at: recipient.created_at || timestamp,
  })).filter(recipient => recipient.recipient_id)
  return {
    pets,
    tracking_items: trackingItems,
    tracking_versions: trackingVersions,
    symptom_catalog: symptomCatalog,
    symptom_logs: symptomLogs,
    diary_logs: diaryLogs,
    activity_logs: activityLogs,
    treatment_history: treatmentHistory,
    reminders,
    reminder_recipients: reminderRecipients,
  }
}

export function serializeNormalizedState(state, timestamp) {
  const objects = normalizedRowsFromState(state, timestamp)
  return Object.fromEntries(NORMALIZED_STATE_SHEETS.map(name => [
    name,
    objects[name].map(object => PETCARE_SHEETS[name].map(header => {
      const value = object[header]
      return typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : (value ?? '')
    })),
  ]))
}

export function deserializeNormalizedState(sheetRows) {
  const objects = Object.fromEntries(NORMALIZED_STATE_SHEETS.map(name => {
    const headers = PETCARE_SHEETS[name]
    return [name, (sheetRows[name] || []).filter(row => row.some(value => value !== '')).map(row => rowObject(headers, row))]
  }))
  const versions = new Map()
  objects.tracking_versions.forEach(version => {
    const key = String(version.tracking_item_id)
    const list = versions.get(key) || []
    list.push({ ...version, schedule_config: safeJson(version.schedule_config, {}), active: asBoolean(version.active, true) })
    versions.set(key, list)
  })
  const tracks = objects.tracking_items.map(item => {
    const itemVersions = versions.get(String(item.id)) || []
    const version = [...itemVersions].reverse().find(candidate => candidate.active) || itemVersions.at(-1) || {}
    const config = version.schedule_config || {}
    return {
      id: item.id,
      version_id: version.id || `${item.id}_current`,
      pet_id: item.pet_id || version.pet_id || '',
      name: item.name || version.name || '',
      version_name: version.name || item.name || '',
      dose: version.dose || '',
      schedule: config.display || '',
      schedule_type: version.schedule_type || 'display',
      schedule_config: config,
      start_at: version.start_at || '',
      end_at: version.end_at || '',
      active: asBoolean(item.active, asBoolean(version.active, true)),
      version_active: asBoolean(version.active, true),
      created_at: item.created_at || '',
      updated_at: item.updated_at || '',
      version_created_at: version.created_at || '',
      version_updated_at: version.updated_at || '',
      versions: itemVersions,
    }
  })
  const diaries = new Map(objects.diary_logs.map(row => [String(row.id), row]))
  const logs = objects.symptom_logs.map(row => {
    const symptoms = safeJson(row.symptoms_json, [])
    const diaryRow = diaries.get(String(row.id))
    return {
      id: row.id,
      pet_id: row.pet_id || '',
      datetime: row.occurred_at || '',
      occurred_at: row.occurred_at || '',
      symptom: Array.isArray(symptoms) ? symptoms.join(', ') : String(symptoms || ''),
      symptoms: Array.isArray(symptoms) ? symptoms : [],
      symptoms_json: symptoms,
      diary: diaryRow ? (diaryRow.text || '') : (row.diary_text || ''),
      diary_text: row.diary_text || '',
      diary_log_text: diaryRow?.text || '',
      diary_log_present: Boolean(diaryRow),
      tracks: safeJson(row.tracking_snapshot_json, []),
      tracking_snapshot_json: safeJson(row.tracking_snapshot_json, []),
      created_at: row.created_at || '',
      updated_at: row.updated_at || '',
      diary_created_at: diaryRow?.created_at || '',
      diary_updated_at: diaryRow?.updated_at || '',
      symptom_log_present: true,
    }
  })
  const knownLogIds = new Set(logs.map(log => String(log.id)))
  objects.diary_logs.forEach(row => {
    if (knownLogIds.has(String(row.id))) return
    logs.push({ id: row.id, pet_id: row.pet_id || '', datetime: row.occurred_at || '', symptom: '', symptoms: [], diary: row.text || '', diary_text: '', diary_log_text: row.text || '', diary_log_present: true, tracks: [], created_at: '', updated_at: '', diary_created_at: row.created_at || '', diary_updated_at: row.updated_at || '', symptom_log_present: false })
  })
  return {
    pets: objects.pets.map(pet => ({ ...pet, active: asBoolean(pet.active, true), demo: false })),
    tracks,
    symptoms: objects.symptom_catalog.map(row => ({ ...row, active: asBoolean(row.active, true) })).filter(row => row.label_th || row.label_en),
    logs,
    activities: objects.activity_logs.map(row => ({
      id: row.id,
      pet_id: row.pet_id || '',
      datetime: row.occurred_at || '',
      occurred_at: row.occurred_at || '',
      symptom: row.activity_type || '',
      activity_type: row.activity_type || '',
      diary: row.note || '',
      note: row.note || '',
      duration_minutes: row.duration_minutes,
      weight_kg: row.weight_kg,
      created_at: row.created_at || '',
      updated_at: row.updated_at || '',
    })),
    treatmentHistory: objects.treatment_history.map(row => ({
      id: row.id,
      pet_id: row.pet_id || '',
      category: row.category || '',
      title: row.title || '',
      started_at: row.started_at || '',
      ended_at: row.ended_at || '',
      clinic: row.clinic || '',
      doctor: row.doctor || '',
      note: row.note || '',
      created_at: row.created_at || '',
      updated_at: row.updated_at || '',
    })),
    reminders: objects.reminders.map(row => {
      const config = safeJson(row.schedule_config, {})
      const scheduleConfig = {
        ...config,
        ...(config.date || !row.start_at ? {} : { date: row.start_at }),
      }
      return {
        id: row.id,
        pet_id: row.pet_id || '',
        type: row.type || 'main_app',
        title: row.title || '',
        detail: scheduleConfig.detail || '',
        schedule_type: row.schedule_type || 'display',
        schedule_config: scheduleConfig,
      start_at: row.start_at || '',
      end_at: row.end_at || '',
      enabled: asBoolean(row.active, true),
      active: asBoolean(row.active, true),
      created_at: row.created_at || '',
      updated_at: row.updated_at || '',
      }
    }),
    lineRecipients: objects.reminder_recipients.map(row => ({
      id: row.id,
      reminder_id: row.reminder_id || '*',
      recipient_id: row.recipient_id || '',
      created_at: row.created_at || '',
    })).filter(row => row.recipient_id),
  }
}

async function loadNormalizedSheets(accessToken, spreadsheetId) {
  const ranges = NORMALIZED_STATE_SHEETS.map(name => encodeURIComponent(`${name}!A1:ZZ`)).join('&ranges=')
  const data = await apiFetch(`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?ranges=${ranges}`, {
    headers: authHeaders(accessToken),
  })
  return Object.fromEntries(NORMALIZED_STATE_SHEETS.map((name, index) => {
    const requiredHeaders = PETCARE_SHEETS[name]
    const values = data.valueRanges?.[index]?.values || []
    const firstRow = values[0] || []
    const hasHeader = firstRow.some(value => requiredHeaders.includes(value))
    const headers = hasHeader ? firstRow : requiredHeaders
    const rawRows = hasHeader ? values.slice(1) : values
    const rows = rawRows.map(row => requiredHeaders.map(header => {
      const column = headers.indexOf(header)
      return column >= 0 ? (row[column] ?? '') : ''
    }))
    return [name, { headers, rawRows, rows }]
  }))
}

export async function loadPetCareState(accessToken, spreadsheetId) {
  const [legacy, sheets] = await Promise.all([
    loadAppState(accessToken, spreadsheetId),
    loadNormalizedSheets(accessToken, spreadsheetId),
  ])
  const rows = Object.fromEntries(Object.entries(sheets).map(([name, sheet]) => [name, sheet.rows]))
  const normalized = deserializeNormalizedState(rows)
  const migrated = Number(legacy?.__normalized_schema_version || 0) >= NORMALIZED_SCHEMA_VERSION
  if (migrated) return { ...(legacy || {}), ...normalized }
  if (!legacy) return Object.values(rows).some(sheet => sheet.length > 0) ? normalized : null
  const merged = { ...legacy }
  const sources = {
    pets: ['pets'],
    tracks: ['tracking_items', 'tracking_versions'],
    symptoms: ['symptom_catalog'],
    logs: ['symptom_logs', 'diary_logs'],
    activities: ['activity_logs'],
    treatmentHistory: ['treatment_history'],
    reminders: ['reminders'],
    lineRecipients: ['reminder_recipients'],
  }
  for (const [key, sheets] of Object.entries(sources)) {
    if (sheets.some(name => rows[name].length > 0)) merged[key] = normalized[key]
  }
  return merged
}

function reconcileNormalizedRows(name, existingRows, desiredRows) {
  const headers = PETCARE_SHEETS[name]
  const idIndex = headers.indexOf('id')
  const desiredById = new Map(desiredRows.filter(row => row[idIndex] !== '').map(row => [String(row[idIndex]), row]))
  const activeIndex = headers.indexOf('active')
  const createdAtIndex = headers.indexOf('created_at')
  const reconciled = existingRows.filter(row => row.some(value => value !== '')).flatMap(row => {
    const id = String(row[idIndex] ?? '')
    if (desiredById.has(id)) {
      const desired = [...desiredById.get(id)]
      desiredById.delete(id)
      if (createdAtIndex >= 0 && row[createdAtIndex]) desired[createdAtIndex] = row[createdAtIndex]
      return [desired]
    }
    const isInactiveRecord = (name === 'pets' || name === 'symptom_catalog') && activeIndex >= 0 && !asBoolean(row[activeIndex], true)
    const isTrackingHistory = name === 'tracking_versions' && id !== ''
    return isInactiveRecord || isTrackingHistory ? [row] : []
  })
  return [...reconciled, ...desiredById.values()]
}

export async function savePetCareState(accessToken, spreadsheetId, state) {
  const existing = await loadNormalizedSheets(accessToken, spreadsheetId)
  const serialized = serializeNormalizedState(state)
  for (const name of NORMALIZED_STATE_SHEETS) {
    serialized[name] = reconcileNormalizedRows(name, existing[name].rows, serialized[name])
  }
  const data = NORMALIZED_STATE_SHEETS.flatMap(name => {
    const requiredHeaders = PETCARE_SHEETS[name]
    const headers = existing[name].headers.length ? existing[name].headers : requiredHeaders
    const rowCount = Math.max(serialized[name].length, 1)
    return requiredHeaders.flatMap((header, requiredIndex) => {
      const actualIndex = headers.indexOf(header)
      if (actualIndex < 0) return []
      const column = columnName(actualIndex + 1)
      return [{
        range: `${name}!${column}2:${column}${rowCount + 1}`,
        majorDimension: 'ROWS',
        values: Array.from({ length: rowCount }, (_, rowIndex) => [serialized[name][rowIndex]?.[requiredIndex] ?? '']),
      }]
    })
  })
  const legacy = encodeAppState({
    __normalized_schema_version: NORMALIZED_SCHEMA_VERSION,
    activePetId: state.activePetId || '',
  })
  data.push({ range: 'app_state!A2:C2', majorDimension: 'ROWS', values: [[legacy.key, legacy.value, legacy.updated_at]] })
  data.push({ range: 'app_state!A3:C3', majorDimension: 'ROWS', values: [['account_state', JSON.stringify({ tracks: state.tracks || [], logs: state.logs || [], activities: state.activities || [], reminders: state.reminders || [], symptoms: state.symptoms || [], pets: state.pets || [], treatmentHistory: state.treatmentHistory || [], lineRecipients: state.lineRecipients || [], activePetId: state.activePetId || '' }), legacy.updated_at]] })
  await apiFetch(`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  })

  // Reconciliation compacts deleted records. Clear the old tail so removed
  // rows do not remain as visible blank data rows in the user's Sheet. We
  // clear only PetCare-owned columns and leave user-created columns intact.
  const staleRanges = NORMALIZED_STATE_SHEETS.flatMap(name => {
    const existingRows = existing[name].rows
    const desiredCount = serialized[name].length
    if (existingRows.length <= desiredCount) return []
    const headers = existing[name].headers.length ? existing[name].headers : PETCARE_SHEETS[name]
    const startRow = desiredCount + 2
    const endRow = existingRows.length + 1
    return PETCARE_SHEETS[name].flatMap(header => {
      const actualIndex = headers.indexOf(header)
      if (actualIndex < 0) return []
      const column = columnName(actualIndex + 1)
      return `${name}!${column}${startRow}:${column}${endRow}`
    })
  })
  if (staleRanges.length > 0) {
    await apiFetch(`${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchClear`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ ranges: staleRanges }),
    })
  }
  return legacy
}
