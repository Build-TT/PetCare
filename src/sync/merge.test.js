import { describe, expect, it } from 'vitest'
import { SYNCED_COLLECTIONS, mergeCollection, mergePersistedStates, snapshotBaseline } from './merge.js'

const log = (id, updated_at, extra = {}) => ({ id, pet_id: 'p1', datetime: '2026-08-01T10:00', updated_at, ...extra })

describe('snapshotBaseline', () => {
  it('records an id-to-timestamp map for every synced collection', () => {
    const baseline = snapshotBaseline({ logs: [log('l1', 't1')], pets: [{ id: 'p1', updated_at: 't2' }] })
    expect(baseline.logs).toEqual({ l1: 't1' })
    expect(baseline.pets).toEqual({ p1: 't2' })
    SYNCED_COLLECTIONS.forEach(name => expect(baseline[name]).toBeTypeOf('object'))
  })

  it('falls back to created_at and tolerates records without timestamps', () => {
    const baseline = snapshotBaseline({ logs: [{ id: 'l1', created_at: 'c1' }, { id: 'l2' }] })
    expect(baseline.logs).toEqual({ l1: 'c1', l2: '' })
  })

  it('ignores a missing state', () => {
    expect(snapshotBaseline(null).logs).toEqual({})
  })
})

describe('mergeCollection', () => {
  it('keeps records only the other device created', () => {
    const merged = mergeCollection({}, [log('mine', 't1')], [log('theirs', 't1')])
    expect(merged.map(item => item.id)).toEqual(['mine', 'theirs'])
  })

  it('keeps the newer version when both devices changed the same record', () => {
    const merged = mergeCollection({ shared: '2026-08-01T00:00:00Z' },
      [log('shared', '2026-08-01T02:00:00Z', { diary: 'local' })],
      [log('shared', '2026-08-01T05:00:00Z', { diary: 'remote' })])
    expect(merged).toEqual([expect.objectContaining({ diary: 'remote' })])
  })

  it('prefers the local record when timestamps tie', () => {
    const merged = mergeCollection({ shared: 'a' }, [log('shared', 'a', { diary: 'local' })], [log('shared', 'a', { diary: 'remote' })])
    expect(merged).toEqual([expect.objectContaining({ diary: 'local' })])
  })

  it('applies a remote delete when the local copy is untouched since the baseline', () => {
    const merged = mergeCollection({ gone: 't1' }, [log('gone', 't1')], [])
    expect(merged).toEqual([])
  })

  it('keeps a locally edited record that the other device deleted', () => {
    const merged = mergeCollection({ gone: 't1' }, [log('gone', 't2', { diary: 'edited here' })], [])
    expect(merged).toEqual([expect.objectContaining({ diary: 'edited here' })])
  })

  it('applies a local delete when the remote copy is untouched since the baseline', () => {
    const merged = mergeCollection({ gone: 't1' }, [], [log('gone', 't1')])
    expect(merged).toEqual([])
  })

  it('keeps a remotely edited record that this device deleted', () => {
    const merged = mergeCollection({ gone: 't1' }, [], [log('gone', 't2')])
    expect(merged).toEqual([expect.objectContaining({ id: 'gone', updated_at: 't2' })])
  })

  it('treats two spellings of the same instant as a tie, not as a newer record', () => {
    // A plain string compare ranks the longer '...00.000Z' below '...00Z'
    // even though both name the same moment, silently discarding the local edit.
    const merged = mergeCollection({ shared: 'x' },
      [log('shared', '2026-08-01T10:00:00.000Z', { diary: 'local' })],
      [log('shared', '2026-08-01T10:00:00Z', { diary: 'remote' })])
    expect(merged).toEqual([expect.objectContaining({ diary: 'local' })])
  })

  it('compares a local-time timestamp against an ISO one by real time', () => {
    const localForm = '2026-08-01T10:05'
    const oneMinuteLater = new Date(Date.parse(localForm) + 60000).toISOString()
    const merged = mergeCollection({ shared: 'x' },
      [log('shared', localForm, { diary: 'local' })],
      [log('shared', oneMinuteLater, { diary: 'remote is genuinely newer' })])
    expect(merged).toEqual([expect.objectContaining({ diary: 'remote is genuinely newer' })])
  })

  it('keeps an untimestamped local record from losing to its own saved copy', () => {
    // Serialization stamps updated_at on the way into the Sheet while the local
    // record keeps none; without this the round trip overwrites the local edit.
    const merged = mergeCollection({ shared: '' },
      [log('shared', undefined, { diary: 'edited locally' })],
      [log('shared', '2026-08-01T10:00:00.000Z', { diary: 'serialized copy' })])
    expect(merged).toEqual([expect.objectContaining({ diary: 'edited locally' })])
  })

  it('never drops anything when there is no baseline yet', () => {
    const merged = mergeCollection(null, [log('a', 't1')], [log('b', 't1')])
    expect(merged.map(item => item.id)).toEqual(['a', 'b'])
  })

  it('keeps records that carry no id so they cannot be silently discarded', () => {
    const merged = mergeCollection({}, ['ปวดท้อง'], [{ id: 's1', label_th: 'ไอ' }])
    expect(merged).toEqual(['ปวดท้อง', { id: 's1', label_th: 'ไอ' }])
  })
})

describe('mergePersistedStates', () => {
  const local = { logs: [log('local-only', 't1')], activePetId: 'p1', pets: [{ id: 'p1', name: 'Local' }] }
  const remote = { logs: [log('remote-only', 't1')], activePetId: 'p2', pets: [{ id: 'p2', name: 'Remote' }] }

  it('unions every synced collection instead of picking one side', () => {
    const merged = mergePersistedStates({ baseline: null, local, remote })
    expect(merged.logs.map(item => item.id)).toEqual(['local-only', 'remote-only'])
    expect(merged.pets.map(item => item.id)).toEqual(['p1', 'p2'])
  })

  it('returns local data untouched when there is no remote state', () => {
    expect(mergePersistedStates({ baseline: null, local, remote: null }).logs).toEqual(local.logs)
  })

  it('adopts remote data when this device has nothing yet', () => {
    const merged = mergePersistedStates({ baseline: null, local: {}, remote })
    expect(merged.logs.map(item => item.id)).toEqual(['remote-only'])
    expect(merged.activePetId).toBe('p2')
  })

  it('keeps the local active pet selection', () => {
    expect(mergePersistedStates({ baseline: null, local, remote }).activePetId).toBe('p1')
  })

  it('falls back to a real pet when the local selection no longer exists', () => {
    const merged = mergePersistedStates({ baseline: null, local: { pets: [], activePetId: 'pet_default' }, remote })
    expect(merged.activePetId).toBe('p2')
  })

  it('never loses a record after a full round trip between two devices', () => {
    const baseline = snapshotBaseline({ logs: [log('shared', 't1')] })
    const deviceA = { logs: [log('shared', 't1'), log('a-new', 't2')] }
    const deviceB = { logs: [log('shared', 't1'), log('b-new', 't2')] }
    const afterA = mergePersistedStates({ baseline, local: deviceA, remote: { logs: [log('shared', 't1')] } })
    const afterB = mergePersistedStates({ baseline, local: deviceB, remote: afterA })
    expect(afterB.logs.map(item => item.id).sort()).toEqual(['a-new', 'b-new', 'shared'])
  })
})
