const GAS_URL = import.meta.env.VITE_GAS_URL || ''

function validLineUserId(value) {
  return /^U[0-9a-fA-F]{32}$/.test(String(value || '').trim())
}

export async function provisionGoogleLineLink({ accessToken, spreadsheetId, lineUserId, endpoint = GAS_URL }) {
  if (!endpoint) throw new Error('ยังไม่ได้ตั้งค่า VITE_GAS_URL')
  if (!accessToken) throw new Error('ไม่พบ Google access token; กรุณาเชื่อมต่อ Google ใหม่')
  if (!spreadsheetId) throw new Error('ไม่พบ Google Sheet ID')
  if (!validLineUserId(lineUserId)) throw new Error('LINE User ID ไม่ถูกต้อง')

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'provisionUser',
      google_access_token: accessToken,
      spreadsheet_id: spreadsheetId,
      line_user_id: String(lineUserId).trim(),
    }),
  })
  let data = null
  try { data = await response.json() } catch { /* handled below */ }
  if (!response.ok || !data || data.status === 'error') {
    throw new Error(data?.message || `GAS provisioning failed: ${response.status}`)
  }
  return data
}
