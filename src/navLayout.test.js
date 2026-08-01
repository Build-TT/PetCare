import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAIN_NAV_ITEMS } from './App.jsx'

// index.css and appFeatures.css are both imported by App.jsx (index.css first),
// so the LAST `.bottom-nav` grid-template-columns declaration wins the cascade.
// When that count drifts below the number of nav buttons the extra button is
// pushed onto an implicit second row, outside the fixed nav height, and falls
// off the bottom of the screen.
const STYLESHEETS_IN_IMPORT_ORDER = ['./index.css', './appFeatures.css']

function readStylesheet(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

export function effectiveBottomNavColumns(cssSources) {
  const declarations = cssSources.flatMap(css => [...css.matchAll(/\.bottom-nav\s*\{([^}]*)\}/g)]
    .flatMap(block => [...block[1].matchAll(/grid-template-columns\s*:\s*repeat\(\s*(\d+)/g)]
      .map(match => Number(match[1]))))
  return declarations.at(-1) ?? 0
}

describe('bottom navigation layout', () => {
  it('keeps every primary nav button on a single row', () => {
    const sources = STYLESHEETS_IN_IMPORT_ORDER.map(readStylesheet)
    expect(effectiveBottomNavColumns(sources)).toBe(MAIN_NAV_ITEMS.length)
  })

  it('declares a settings entry as the final nav item', () => {
    expect(MAIN_NAV_ITEMS.map(([key]) => key)).toEqual(['home', 'track', 'diary', 'reminders', 'settings'])
  })
})
