import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ensureGoogleAccessTokenMock, clearGoogleTokenCacheMock, requestGoogleAccessTokenMock, getGoogleUserProfileMock } = vi.hoisted(() => ({
  ensureGoogleAccessTokenMock: vi.fn(),
  clearGoogleTokenCacheMock: vi.fn(),
  requestGoogleAccessTokenMock: vi.fn(),
  getGoogleUserProfileMock: vi.fn(),
}))

vi.mock('./googleAuth.js', () => ({
  isGoogleConfigured: () => true,
  loadGoogleIdentityServices: () => Promise.resolve(),
  requestGoogleAccessToken: requestGoogleAccessTokenMock,
  ensureGoogleAccessToken: ensureGoogleAccessTokenMock,
  clearGoogleTokenCache: clearGoogleTokenCacheMock,
  getGoogleUserProfile: getGoogleUserProfileMock,
}))

// withGoogleTokenRetry is a module-scope helper in App.jsx (not React state),
// so it can be unit-tested directly without rendering the component tree.
import { withGoogleTokenRetry } from './App.jsx'

describe('withGoogleTokenRetry', () => {
  beforeEach(() => {
    ensureGoogleAccessTokenMock.mockReset()
    clearGoogleTokenCacheMock.mockReset()
  })

  it('clears the cached token and retries exactly once on a 401, then resolves with the fresh token', async () => {
    ensureGoogleAccessTokenMock
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token')
    const action = vi.fn()
      .mockRejectedValueOnce(new Error('Google API error (401) [401 /v4/spreadsheets/x]'))
      .mockResolvedValueOnce({ status: 'ok' })
    const connection = { mode: 'google', email: 'owner@example.com' }

    const result = await withGoogleTokenRetry(connection, action)

    expect(result).toEqual({ status: 'ok' })
    expect(action).toHaveBeenCalledTimes(2)
    expect(action).toHaveBeenNthCalledWith(1, 'stale-token')
    expect(action).toHaveBeenNthCalledWith(2, 'fresh-token')
    expect(ensureGoogleAccessTokenMock).toHaveBeenCalledTimes(2)
    // The cache must be cleared before the retry's ensureGoogleAccessToken
    // call, otherwise a cached-but-dead token (revoked session, not just
    // expired) would be handed back unchanged and the retry would be a
    // functional no-op.
    expect(clearGoogleTokenCacheMock).toHaveBeenCalledTimes(1)
    const clearOrder = clearGoogleTokenCacheMock.mock.invocationCallOrder[0]
    const secondEnsureOrder = ensureGoogleAccessTokenMock.mock.invocationCallOrder[1]
    expect(clearOrder).toBeLessThan(secondEnsureOrder)
  })

  it('does not retry on a non-401 error and only attempts the action once', async () => {
    ensureGoogleAccessTokenMock.mockResolvedValue('token')
    const error = new Error('Google API error (500) [500 /v4/spreadsheets/x]')
    const action = vi.fn().mockRejectedValue(error)
    const connection = { mode: 'google', email: 'owner@example.com' }

    await expect(withGoogleTokenRetry(connection, action)).rejects.toThrow(error)
    expect(action).toHaveBeenCalledTimes(1)
    expect(clearGoogleTokenCacheMock).not.toHaveBeenCalled()
  })

  it('never calls ensureGoogleAccessToken for account-mode connections, even on a 401', async () => {
    const action = vi.fn().mockRejectedValue(new Error('401'))
    const connection = { mode: 'account', accessToken: '', email: 'owner@example.com' }

    await expect(withGoogleTokenRetry(connection, action)).rejects.toThrow('401')
    expect(action).toHaveBeenCalledTimes(1)
    expect(action).toHaveBeenCalledWith('')
    expect(ensureGoogleAccessTokenMock).not.toHaveBeenCalled()
    expect(clearGoogleTokenCacheMock).not.toHaveBeenCalled()
  })
})
