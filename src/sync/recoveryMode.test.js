import { describe, expect, it } from 'vitest'
import { isRecoveryMode } from './recoveryMode.js'

describe('recovery mode', () => {
  it('activates only with the explicit recovery query', () => {
    expect(isRecoveryMode(new URL('https://petcare.example/?recovery=1'))).toBe(true)
    expect(isRecoveryMode(new URL('https://petcare.example/'))).toBe(false)
    expect(isRecoveryMode(new URL('https://petcare.example/?recovery=0'))).toBe(false)
  })
})
