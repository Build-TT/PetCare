import { describe, expect, it } from 'vitest'
import { GOOGLE_SCOPES, isGoogleConfigured } from './googleAuth.js'

describe('Google authentication configuration', () => {
  it('uses the narrow per-file scope needed to create and update a PetCare Sheet', () => {
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/userinfo.email')
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/drive.file')
    expect(GOOGLE_SCOPES).not.toContain('https://www.googleapis.com/auth/spreadsheets')
  })

  it('reflects whether a Google OAuth client id is configured for this environment', () => {
    expect(isGoogleConfigured()).toBe(Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID))
  })
})
