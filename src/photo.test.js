import { describe, expect, it, vi } from 'vitest'
import { compressPhotoToDataUrl } from './photo.js'

// Mirrors the dimension/quality ladder compressPhotoToDataUrl must walk:
// [512, 0.85] -> [512, 0.7] -> [384, 0.7] -> [384, 0.55] -> [256, 0.55] -> [256, 0.4]
const LADDER = [
  [512, 0.85],
  [512, 0.7],
  [384, 0.7],
  [384, 0.55],
  [256, 0.55],
  [256, 0.4],
]

const PREFIX = 'data:image/jpeg;base64,'
const makeDataUrl = length => `${PREFIX}${'A'.repeat(Math.max(0, length - PREFIX.length))}`

function renderForLengths(lengths) {
  return vi.fn(async (_source, maxDimension, quality) => {
    const index = LADDER.findIndex(([dim, q]) => dim === maxDimension && q === quality)
    if (index === -1) throw new Error(`unexpected ladder rung ${maxDimension}/${quality}`)
    return makeDataUrl(lengths[index])
  })
}

describe('compressPhotoToDataUrl', () => {
  it('walks the ladder in order, stopping at the first attempt that fits maxChars', async () => {
    const lengths = [50000, 45000, 42000, 38000, 30000, 20000]
    const render = renderForLengths(lengths)
    const result = await compressPhotoToDataUrl('data:image/png;base64,ORIGINAL', { maxChars: 40000, render })
    expect(render.mock.calls.map(call => [call[1], call[2]])).toEqual([
      [512, 0.85], [512, 0.7], [384, 0.7], [384, 0.55],
    ])
    expect(result.length).toBe(38000)
  })

  it('exits early on the very first ladder rung once it already fits', async () => {
    const render = vi.fn(async () => makeDataUrl(1000))
    const source = 'data:image/png;base64,ORIGINAL'
    const result = await compressPhotoToDataUrl(source, { maxChars: 40000, render })
    expect(render).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledWith(source, 512, 0.85)
    expect(result.length).toBe(1000)
  })

  it('tries every ladder rung and returns the smallest attempt when none fit maxChars', async () => {
    const lengths = [90000, 80000, 70000, 65000, 60000, 55000]
    const render = renderForLengths(lengths)
    const result = await compressPhotoToDataUrl('data:image/png;base64,ORIGINAL', { maxChars: 40000, render })
    expect(render).toHaveBeenCalledTimes(LADDER.length)
    expect(result.length).toBe(55000)
  })

  it('passes an existing data URL through unchanged when render throws', async () => {
    const render = vi.fn(async () => { throw new Error('no canvas in this environment') })
    const original = 'data:image/png;base64,ORIGINAL'
    const result = await compressPhotoToDataUrl(original, { maxChars: 40000, render })
    expect(result).toBe(original)
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('falls back to FileReader for a File source when render is unavailable', async () => {
    const render = vi.fn(async () => { throw new Error('no canvas in this environment') })
    const file = new File(['hello-photo-bytes'], 'pet.jpg', { type: 'image/jpeg' })
    const result = await compressPhotoToDataUrl(file, { maxChars: 40000, render })
    expect(render).toHaveBeenCalledTimes(1)
    expect(result.startsWith('data:image/jpeg')).toBe(true)
    expect(result.length).toBeGreaterThan(PREFIX.length)
  })
})
