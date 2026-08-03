import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GOOGLE_SCOPES, isGoogleConfigured } from './googleAuth.js'

describe('Google authentication configuration', () => {
  it('requests the narrow scopes needed for a user-owned PetCare Sheet', () => {
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/userinfo.email')
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/drive.file')
    expect(GOOGLE_SCOPES).not.toContain('https://www.googleapis.com/auth/spreadsheets')
  })

  it('reports whether a Google OAuth client id is configured', () => {
    expect(typeof isGoogleConfigured()).toBe('boolean')
  })
})

describe('Google access token lifecycle', () => {
  let initTokenClient
  let capturedConfig
  let googleAuth

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id')

    capturedConfig = undefined
    initTokenClient = vi.fn((config) => {
      capturedConfig = config
      return {
        requestAccessToken: vi.fn((overrides) => {
          capturedConfig.lastRequestOverrides = overrides
        }),
      }
    })

    window.google = {
      accounts: {
        oauth2: {
          initTokenClient,
        },
      },
    }

    googleAuth = await import('./googleAuth.js')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    delete window.google
  })

  // requestGoogleAccessToken awaits loadGoogleIdentityServices() before it
  // synchronously registers the pending request and calls
  // tokenClient.requestAccessToken(), so tests must flush microtasks before
  // the stubbed GIS callback can be invoked.
  async function flushMicrotasks() {
    await Promise.resolve()
    await Promise.resolve()
  }

  async function simulateSuccess(accessToken, expiresIn) {
    await flushMicrotasks()
    capturedConfig.callback({ access_token: accessToken, expires_in: expiresIn })
  }

  async function simulateError(errorType) {
    await flushMicrotasks()
    capturedConfig.callback({ error: errorType, error_description: 'boom' })
  }

  it('resolves the token and records expiry from expires_in', async () => {
    const promise = googleAuth.requestGoogleAccessToken({ prompt: '' })
    await simulateSuccess('token-abc', 3600)
    await expect(promise).resolves.toBe('token-abc')
    expect(googleAuth.getCachedGoogleAccessToken()).toBe('token-abc')
  })

  it('ensureGoogleAccessToken returns the cached token without a second requestAccessToken call while fresh', async () => {
    const first = googleAuth.ensureGoogleAccessToken({ email: 'user@example.com' })
    await simulateSuccess('token-fresh', 3600)
    await expect(first).resolves.toBe('token-fresh')

    const tokenClientInstance = initTokenClient.mock.results[0].value
    tokenClientInstance.requestAccessToken.mockClear()

    const second = await googleAuth.ensureGoogleAccessToken({ email: 'user@example.com' })
    expect(second).toBe('token-fresh')
    expect(tokenClientInstance.requestAccessToken).not.toHaveBeenCalled()
    expect(initTokenClient).toHaveBeenCalledTimes(1)
  })

  it('ensureGoogleAccessToken silently re-requests with prompt: none and login_hint when expired', async () => {
    const first = googleAuth.ensureGoogleAccessToken({ email: 'user@example.com' })
    await simulateSuccess('token-old', 60) // expires in 60s, less than default minTtlMs (5 min)
    await expect(first).resolves.toBe('token-old')

    const tokenClientInstance = initTokenClient.mock.results[0].value

    const second = googleAuth.ensureGoogleAccessToken({ email: 'user@example.com' })
    await simulateSuccess('token-new', 3600)
    await expect(second).resolves.toBe('token-new')

    expect(tokenClientInstance.requestAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'none', login_hint: 'user@example.com' })
    )
    expect(googleAuth.getCachedGoogleAccessToken()).toBe('token-new')
  })

  it('propagates errors from a silent renewal attempt', async () => {
    const promise = googleAuth.ensureGoogleAccessToken({ email: 'user@example.com' })
    await simulateError('login_required')
    await expect(promise).rejects.toThrow('boom')
  })

  it('getCachedGoogleAccessToken returns an empty string after clearGoogleTokenCache()', async () => {
    const promise = googleAuth.requestGoogleAccessToken({ prompt: '' })
    await simulateSuccess('token-xyz', 3600)
    await promise
    expect(googleAuth.getCachedGoogleAccessToken()).toBe('token-xyz')

    googleAuth.clearGoogleTokenCache()
    expect(googleAuth.getCachedGoogleAccessToken()).toBe('')
  })

  it('omits login_hint from requestAccessToken when not provided', async () => {
    const promise = googleAuth.requestGoogleAccessToken({ prompt: 'none' })
    await simulateSuccess('token-no-hint', 3600)
    await promise

    const tokenClientInstance = initTokenClient.mock.results[0].value
    const overrides = tokenClientInstance.requestAccessToken.mock.calls[0][0]
    expect(overrides).toEqual({ prompt: 'none' })
    expect(overrides.login_hint).toBeUndefined()
  })
})
