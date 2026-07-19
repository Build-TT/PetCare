import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import console from 'node:console'
import process from 'node:process'
import { URL } from 'node:url'

export const config = {
  api: { bodyParser: false },
}

const MAX_BODY_BYTES = 1024 * 1024

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Webhook payload is too large'))
        request.destroy()
        return
      }
      chunks.push(buffer)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function isValidSignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  const actualBuffer = Buffer.from(String(signature), 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

async function postToGas(gasUrl, body) {
  let target = gasUrl
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await globalThis.fetch(target, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (![301, 302, 303, 307, 308].includes(result.status)) return result
    const location = result.headers.get('location')
    if (!location) return result
    target = new URL(location, target).toString()
  }
  throw new Error('GAS webhook redirect limit exceeded')
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ status: 'error', message: 'POST required' })
  }

  const secret = (process.env.LINE_CHANNEL_SECRET || '').trim()
  const gasUrl = (process.env.VITE_GAS_URL || '').trim()
  const relaySecret = (process.env.GAS_WEBHOOK_SECRET || '').trim()
  if (!secret || !gasUrl || !relaySecret) {
    return response.status(500).json({ status: 'error', message: 'Webhook relay is not configured' })
  }

  try {
    const rawBody = await readRawBody(request)
    const signature = request.headers['x-line-signature'] || ''
    if (!isValidSignature(rawBody, signature, secret)) {
      console.warn('Invalid LINE webhook signature', {
        bodyBytes: Buffer.byteLength(rawBody, 'utf8'),
        signaturePresent: Boolean(signature),
        channelSecretLength: secret.length,
      })
      return response.status(401).json({ status: 'error', message: 'Invalid LINE webhook signature' })
    }

    const payload = JSON.parse(rawBody)
    if (!Array.isArray(payload.events)) {
      return response.status(400).json({ status: 'error', message: 'Invalid LINE webhook payload' })
    }
    // LINE sends an empty events array when its console verifies the webhook
    // URL. There is nothing to persist in GAS, so acknowledge it immediately.
    if (payload.events.length === 0) {
      return response.status(200).json({ status: 'ok' })
    }

    const gasResponse = await postToGas(gasUrl, JSON.stringify({
      action: 'lineWebhookRelay',
      relay_secret: relaySecret,
      payload,
    }))
    const gasText = await gasResponse.text()
    let gasBody = null
    try {
      gasBody = JSON.parse(gasText)
    } catch {
      // GAS response is still checked by HTTP status.
    }
    if (!gasResponse.ok || gasBody?.status === 'error') {
      console.error('GAS webhook relay failed', gasResponse.status, gasText.slice(0, 500))
      return response.status(502).json({ status: 'error', message: 'GAS webhook relay failed' })
    }
    return response.status(200).json({ status: 'ok' })
  } catch (error) {
    console.error('LINE webhook relay error', error)
    return response.status(400).json({ status: 'error', message: 'Invalid webhook request' })
  }
}
