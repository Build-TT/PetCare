import { describe, expect, it } from 'vitest'
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
