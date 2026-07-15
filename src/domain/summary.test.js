import { describe, expect, it } from 'vitest'
import { summarizeSymptoms } from './summary.js'

describe('summarizeSymptoms', () => {
  it('reports the most frequent three-hour time window for the selected logs', () => {
    const logs = [
      { datetime: '2026-07-14T18:15:00+07:00', symptom: 'vomit' },
      { datetime: '2026-07-14T19:10:00+07:00', symptom: 'vomit' },
      { datetime: '2026-07-15T20:45:00+07:00', symptom: 'lethargy' },
      { datetime: '2026-07-15T09:15:00+07:00', symptom: 'vomit' },
    ]

    expect(summarizeSymptoms(logs)).toMatchObject({
      total: 4,
      mostFrequentSymptom: { key: 'vomit', count: 3 },
      mostFrequentWindow: { startHour: 18, endHour: 21, count: 3 },
    })
  })
})
