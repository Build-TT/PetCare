const DRIVE_API = 'https://www.googleapis.com/drive/v3'

function headers(accessToken) {
  if (!accessToken) throw new Error('Google access token is missing; please reconnect Google')
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

async function driveFetch(url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {
    let message = `Google Drive error (${response.status})`
    try { message = (await response.json()).error?.message || message } catch { /* keep generic */ }
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return response.status === 204 ? null : response.json()
}

export async function listSheetPermissions(accessToken, spreadsheetId) {
  const fields = encodeURIComponent('permissions(id,type,emailAddress,role,displayName,photoLink)')
  const data = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(spreadsheetId)}/permissions?fields=${fields}&pageSize=100`, { headers: headers(accessToken) })
  return data.permissions || []
}

export async function grantSheetAccess(accessToken, spreadsheetId, emailAddress, role = 'reader') {
  const email = String(emailAddress || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('กรุณากรอกอีเมลที่ถูกต้อง')
  if (!['reader', 'writer'].includes(role)) throw new Error('สิทธิ์ไม่ถูกต้อง')
  const existing = (await listSheetPermissions(accessToken, spreadsheetId)).find(permission =>
    permission.type === 'user' && String(permission.emailAddress || '').toLowerCase() === email
  )
  if (existing?.role === role || existing?.role === 'owner') return existing
  if (existing?.id) {
    return driveFetch(`${DRIVE_API}/files/${encodeURIComponent(spreadsheetId)}/permissions/${encodeURIComponent(existing.id)}`, {
      method: 'PATCH', headers: headers(accessToken), body: JSON.stringify({ role }),
    })
  }
  return driveFetch(`${DRIVE_API}/files/${encodeURIComponent(spreadsheetId)}/permissions?sendNotificationEmail=true`, {
    method: 'POST', headers: headers(accessToken), body: JSON.stringify({ type: 'user', role, emailAddress: email }),
  })
}

export async function revokeSheetAccess(accessToken, spreadsheetId, permissionId) {
  if (!permissionId) throw new Error('ไม่พบ permission id')
  return driveFetch(`${DRIVE_API}/files/${encodeURIComponent(spreadsheetId)}/permissions/${encodeURIComponent(permissionId)}`, {
    method: 'DELETE', headers: headers(accessToken),
  })
}
