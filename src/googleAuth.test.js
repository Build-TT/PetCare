import { describe, expect, it } from 'vitest'
import { GOOGLE_SCOPES, isGoogleConfigured } from './googleAuth.js'

describe('Google authentication configuration', () => {
  it('requests only the scopes needed to create and update a user-owned PetCare Sheet', () => {
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/drive.file')
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/spreadsheets')
  })

  it('reports demo mode when no Google OAuth client id is configured', () => {
    expect(isGoogleConfigured()).toBe(false)
  })
})
