import { beforeEach, describe, expect, it } from 'vitest'
import { clearAccountSession, getAccountSession, saveAccountSession } from './accountAuth.js'

const session = { session_token: 'remembered-token', user: { username: 'pet-owner' } }

describe('account session persistence', () => {
  beforeEach(() => clearAccountSession())

  it('restores a remembered session from local storage after refresh', () => {
    saveAccountSession(session, window.localStorage)
    expect(getAccountSession()).toEqual(session)
  })

  it('restores a non-remembered session from session storage', () => {
    saveAccountSession(session, window.sessionStorage)
    expect(getAccountSession()).toEqual(session)
  })

  it('clears both storage locations on logout', () => {
    saveAccountSession(session, window.localStorage)
    saveAccountSession(session, window.sessionStorage)
    clearAccountSession()
    expect(getAccountSession()).toBeNull()
  })
})
