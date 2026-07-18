import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(js|jsx|css)$/.test(entry.name) ? [path] : []
  })
}

describe('source encoding', () => {
  it('contains valid UTF-8 text without replacement/control mojibake', () => {
    const files = sourceFiles(join(process.cwd(), 'src'))
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toContain('\uFFFD')
      expect(text, file).not.toMatch(/[\u0080-\u009F]/)
      expect(text, file).not.toMatch(new RegExp('[\\u0E18][\\u0090-\\u009F]|\\u0E40\\u20AC'))
      expect(statSync(file).size).toBeGreaterThan(0)
    }
  })
})
