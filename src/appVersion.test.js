import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_VERSION } from './appVersion.js'

// Settings compares APP_VERSION against the version the deployed Apps Script
// reports and warns the user when they differ. The two constants live in
// separately deployed artifacts, so nothing but this test stops the repo from
// shipping a build that permanently accuses a correctly deployed backend of
// being out of date.
function backendVersionFromGas() {
  const source = readFileSync(path.resolve('gas', 'Code.gs'), 'utf8')
  return source.match(/PETCARE_BACKEND_VERSION\s*=\s*'([^']+)'/)?.[1]
}

describe('release version constants', () => {
  it('keeps the web app version in step with the Apps Script backend', () => {
    expect(APP_VERSION).toBe(backendVersionFromGas())
  })
})
