// cache บน localStorage — prefix pet_ + TTL 5 นาที (เหมือนระบบเดิม)
const PREFIX = 'pet_'
const TTL = 5 * 60 * 1000 // 5 นาที

export function getCache(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > TTL) {
      localStorage.removeItem(PREFIX + key)
      return null
    }
    return data
  } catch {
    return null
  }
}

export function setCache(key, data) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // ไม่ต้องทำอะไร ถ้า localStorage เต็ม/ปิด
  }
}

export function bustCache(...keys) {
  if (keys.length === 0) {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k))
    return
  }
  keys.forEach(k => localStorage.removeItem(PREFIX + k))
}
