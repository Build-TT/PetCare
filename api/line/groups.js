import { Buffer } from 'node:buffer'
import console from 'node:console'
import process from 'node:process'
import { URL } from 'node:url'

const MAX_BODY_BYTES = 64 * 1024

function readJsonBody(request) {
  if (request.body && typeof request.body === 'object') return Promise.resolve(request.body)
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request payload is too large'))
        request.destroy()
        return
      }
      chunks.push(buffer)
    })
    request.on('end', () => {
      if (!chunks.length) return resolve({})
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (error) { reject(error) }
    })
    request.on('error', reject)
  })
}

async function verifyGoogleAccount(request) {
  const authorization = String(request.headers.authorization || '')
  const accessToken = authorization.replace(/^Bearer\s+/i, '')
  if (!accessToken) return null
  const response = await globalThis.fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return null
  const profile = await response.json()
  return profile.email ? { email: String(profile.email).trim().toLowerCase() } : null
}

async function postToGas(gasUrl, payload) {
  let target = gasUrl
  let method = 'POST'
  let body = JSON.stringify(payload)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const options = { method, redirect: 'manual' }
    if (body !== undefined) {
      options.headers = { 'Content-Type': 'application/json' }
      options.body = body
    }
    const response = await globalThis.fetch(target, options)
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    if (!location) return response
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
      method = 'GET'
      body = undefined
    }
    target = new URL(location, target).toString()
  }
  throw new Error('GAS redirect limit exceeded')
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    return response.status(405).json({ status: 'error', message: 'GET or POST required' })
  }

  const gasUrl = (process.env.VITE_GAS_URL || '').trim()
  const relaySecret = (process.env.GAS_WEBHOOK_SECRET || '').trim()
  if (!gasUrl || !relaySecret) {
    return response.status(500).json({ status: 'error', message: 'LINE group service is not configured' })
  }

  try {
    const account = await verifyGoogleAccount(request)
    if (!account) return response.status(401).json({ status: 'error', message: 'Google authentication required' })
    const requestBody = request.method === 'POST' ? await readJsonBody(request) : {}
    const gasResponse = await postToGas(gasUrl, {
      action: request.method === 'POST' ? 'selectLineGroup' : 'lineGroupCatalog',
      relay_secret: relaySecret,
      owner_email: account.email,
      group_id: request.method === 'POST' ? String(requestBody.group_id || '') : '',
    })
    const gasText = await gasResponse.text()
    let gasBody
    try { gasBody = JSON.parse(gasText) } catch { gasBody = null }
    if (!gasResponse.ok || !gasBody || gasBody.status === 'error') {
      console.error('GAS LINE group service failed', gasResponse.status, gasText.slice(0, 500))
      return response.status(502).json({ status: 'error', message: gasBody?.message || 'LINE group service failed' })
    }
    return response.status(200).json(gasBody)
  } catch (error) {
    console.error('LINE group service error', error)
    return response.status(400).json({ status: 'error', message: 'Invalid LINE group request' })
  }
}
