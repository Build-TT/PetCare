export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
]

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
let gisLoader
let tokenClient
let pendingTokenRequest

export function isGoogleConfigured() {
  return Boolean(CLIENT_ID)
}

export function loadGoogleIdentityServices() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Sign-in requires a browser'))
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google)
  if (gisLoader) return gisLoader

  gisLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity-services]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google))
      existing.addEventListener('error', () => reject(new Error('โหลด Google Sign-in ไม่สำเร็จ')))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleIdentityServices = 'true'
    script.onload = () => resolve(window.google)
    script.onerror = () => reject(new Error('โหลด Google Sign-in ไม่สำเร็จ'))
    document.head.appendChild(script)
  })
  return gisLoader
}

export async function requestGoogleAccessToken({ prompt = '' } = {}) {
  if (!isGoogleConfigured()) throw new Error('ยังไม่ได้ตั้งค่า VITE_GOOGLE_CLIENT_ID')
  const google = await loadGoogleIdentityServices()
  return new Promise((resolve, reject) => {
    if (pendingTokenRequest) pendingTokenRequest.reject(new Error('Google authorization is already in progress'))
    pendingTokenRequest = { resolve, reject }
    tokenClient = tokenClient || google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: GOOGLE_SCOPES.join(' '),
      callback: (response) => {
        const pending = pendingTokenRequest
        pendingTokenRequest = undefined
        if (!pending) return
        if (response?.error) pending.reject(new Error(response.error === 'popup_failed_to_open' ? 'เปิดหน้าต่าง Google ไม่ได้ กรุณาอนุญาต Popup สำหรับเว็บไซต์นี้แล้วลองใหม่' : response.error_description || response.error))
        else pending.resolve(response.access_token)
      },
      error_callback: (error) => {
        const pending = pendingTokenRequest
        pendingTokenRequest = undefined
        pending?.reject(new Error(error?.type === 'popup_failed_to_open' ? 'เปิดหน้าต่าง Google ไม่ได้ กรุณาอนุญาต Popup สำหรับเว็บไซต์นี้แล้วลองใหม่' : error?.type || 'Google authorization failed'))
      },
    })
    try {
      // An existing Google session can usually be restored without showing a
      // consent dialog after a normal browser refresh.  GIS will still call
      // the callback with an error when the session has expired; callers can
      // then ask the user to reconnect explicitly.
      tokenClient.requestAccessToken({ prompt })
    } catch (error) {
      pendingTokenRequest = undefined
      reject(error)
    }
  })
}

export async function getGoogleUserProfile(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) throw new Error('อ่านข้อมูล Google Account ไม่สำเร็จ')
  return response.json()
}
