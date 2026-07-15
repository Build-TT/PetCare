const DEFAULT_TIME_ZONE = 'Asia/Bangkok'

function localHour(datetime, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(datetime))
  return Number(parts.find(part => part.type === 'hour')?.value ?? 0)
}

export function summarizeSymptoms(logs, { timeZone = DEFAULT_TIME_ZONE } = {}) {
  const symptomCounts = new Map()
  const hourCounts = Array.from({ length: 24 }, () => 0)

  logs.forEach(log => {
    if (!log?.datetime || !log?.symptom) return
    symptomCounts.set(log.symptom, (symptomCounts.get(log.symptom) ?? 0) + 1)
    hourCounts[localHour(log.datetime, timeZone)] += 1
  })

  const total = [...symptomCounts.values()].reduce((sum, count) => sum + count, 0)
  const mostFrequentSymptom = [...symptomCounts.entries()]
    .sort(([, left], [, right]) => right - left)[0]

  let best = { startHour: 0, endHour: 3, count: 0 }
  for (let startHour = 0; startHour < 24; startHour += 1) {
    const count = [0, 1, 2].reduce(
      (sum, offset) => sum + hourCounts[(startHour + offset) % 24],
      0,
    )
    if (count > best.count) {
      best = { startHour, endHour: (startHour + 3) % 24, count }
    }
  }

  return {
    total,
    mostFrequentSymptom: mostFrequentSymptom
      ? { key: mostFrequentSymptom[0], count: mostFrequentSymptom[1] }
      : null,
    mostFrequentWindow: best.count ? best : null,
    hourlyCounts: hourCounts,
  }
}
