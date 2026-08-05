import { describe, expect, it } from 'vitest'
import { getStorageUsageReport } from './storageUsage.js'

function makeStorageStub(map) {
  const keys = Object.keys(map)
  return {
    length: keys.length,
    key: i => keys[i] ?? null,
    getItem: key => (key in map ? map[key] : null),
  }
}

describe('getStorageUsageReport', () => {
  it('returns entries sorted descending by size with a correct total', () => {
    const storage = makeStorageStub({
      a: 'x'.repeat(10),
      b: 'y'.repeat(30),
      c: 'z'.repeat(5),
    })

    const report = getStorageUsageReport(storage)

    expect(report.totalChars).toBe(45)
    expect(report.entries).toEqual([
      { key: 'b', chars: 30 },
      { key: 'a', chars: 10 },
      { key: 'c', chars: 5 },
    ])
  })

  it('returns petPhotoSizes sorted descending, falling back to id when name is empty, excluding pets with no photo', () => {
    const localState = JSON.stringify({
      pets: [
        { id: 'p1', name: 'Milo', photo: 'a'.repeat(20) },
        { id: 'p2', name: '', photo: 'b'.repeat(50) },
        { id: 'p3', name: 'NoPhoto' },
        { id: 'p4', name: 'EmptyPhoto', photo: '' },
      ],
    })
    const storage = makeStorageStub({ 'petcare.local.v1': localState })

    const report = getStorageUsageReport(storage)

    expect(report.petPhotoSizes).toEqual([
      { name: 'p2', id: 'p2', photoChars: 50 },
      { name: 'Milo', id: 'p1', photoChars: 20 },
    ])
  })

  it('does not throw and yields no petPhotoSizes when petcare.local.v1 is malformed JSON', () => {
    const storage = makeStorageStub({ 'petcare.local.v1': '{not valid json' })

    const report = getStorageUsageReport(storage)

    expect(report.petPhotoSizes).toEqual([])
  })

  it('returns a safe empty shape for empty storage', () => {
    const storage = makeStorageStub({})

    const report = getStorageUsageReport(storage)

    expect(report).toEqual({ totalChars: 0, entries: [], petPhotoSizes: [] })
  })

  it('never throws even when storage.key()/.length themselves throw', () => {
    const storage = {
      get length() { throw new Error('boom') },
      key() { throw new Error('boom') },
      getItem() { throw new Error('boom') },
    }

    expect(() => getStorageUsageReport(storage)).not.toThrow()
    expect(getStorageUsageReport(storage)).toEqual({ totalChars: 0, entries: [], petPhotoSizes: [] })
  })
})
