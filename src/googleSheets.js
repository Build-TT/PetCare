export const PETCARE_SHEETS = {
  pets: ['id', 'name', 'species', 'breed', 'birthdate', 'photo', 'color', 'active', 'order', 'created_at'],
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
  treatment_history: ['id', 'pet_id', 'category', 'title', 'started_at', 'ended_at', 'clinic', 'note', 'created_at', 'updated_at'],
  reminders: ['id', 'pet_id', 'type', 'title', 'schedule_type', 'schedule_config', 'start_at', 'end_at', 'active', 'created_at', 'updated_at'],
  reminder_recipients: ['id', 'reminder_id', 'recipient_id', 'created_at'],
  reminder_deliveries: ['id', 'reminder_id', 'recipient_id', 'scheduled_at', 'status', 'response_code', 'created_at'],
  audit_events: ['id', 'pet_id', 'actor_email', 'action', 'entity_type', 'entity_id', 'created_at'],
  app_state: ['key', 'value', 'updated_at'],
}

const SHEETS_API = 'https://sheets.googleapis.com/v4'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'

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
  const response = await fetch(url, options)
  if (!response.ok) {
    let message = `Google API error (${response.status})`
    try { message = (await response.json()).error?.message || message } catch { /* keep generic message */ }
    throw new Error(message)
  }
  return response.status === 204 ? null : response.json()
}

function authHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

async function initializeSchema(accessToken, spreadsheet) {
  const names = Object.keys(PETCARE_SHEETS)
  const firstSheet = spreadsheet.sheets?.[0]?.properties
  const requests = []
  if (firstSheet) {
    requests.push({ updateSheetProperties: { properties: { sheetId: firstSheet.sheetId, title: names[0] }, fields: 'title' } })
  }
  names.slice(1).forEach((name) => requests.push({ addSheet: { properties: { title: name } } }))
  await apiFetch(`${SHEETS_API}/spreadsheets/${spreadsheet.spreadsheetId}:batchUpdate`, {
    method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({ requests }),
  })
  await Promise.all(names.map((name) => apiFetch(
    `${SHEETS_API}/spreadsheets/${spreadsheet.spreadsheetId}/values/${encodeURIComponent(`${name}!A1`)}?valueInputOption=RAW`,
    { method: 'PUT', headers: authHeaders(accessToken), body: JSON.stringify({ values: [PETCARE_SHEETS[name]] }) },
  )))
}

export async function createOrFindPetCareSheet(accessToken, email) {
  const title = buildPetCareSheetTitle(email)
  const query = encodeURIComponent(`name = '${title.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`)
  const existing = await apiFetch(
    `${DRIVE_API}/files?q=${query}&spaces=drive&orderBy=modifiedTime%20desc&pageSize=10&fields=files(id,name,webViewLink)`,
    { headers: authHeaders(accessToken) },
  )
  if (existing.files?.[0]) {
    const file = existing.files[0]
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
  const row = (data.values || []).find((values) => values[0] === 'ui_state')
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
