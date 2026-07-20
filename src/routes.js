export const MAIN_APP_PAGES = new Set(['home', 'track', 'diary', 'reminders', 'settings'])

function safelyDecode(value) {
  try { return decodeURIComponent(value) } catch { return value }
}

export function parseRoute(search = window.location.search) {
  const params = new URLSearchParams(search)
  const liffState = safelyDecode(params.get('liff.state') || '')
  const query = liffState.includes('?') ? liffState.slice(liffState.indexOf('?') + 1) : ''
  const liffParams = new URLSearchParams(query)
  const page = liffParams.get('page') || params.get('page')

  if (MAIN_APP_PAGES.has(page)) return { kind: 'main', page }
  if (page === 'log') return { kind: 'log' }
  if (page === 'pets') return { kind: 'pets' }
  if (page === 'meds') return { kind: 'meds' }
  if (page === 'types') return { kind: 'types' }
  if (page === 'pet') return { kind: 'pet', petId: liffParams.get('id') || params.get('id') }
  return { kind: 'main', page: 'home' }
}

export function mainPageFromSearch(search = window.location.search) {
  const route = parseRoute(search)
  return route.kind === 'main' ? route.page : 'home'
}

export function mainPageHref(page, href = window.location.href) {
  const url = new URL(href)
  if (page === 'home') url.searchParams.delete('page')
  else url.searchParams.set('page', page)
  url.searchParams.delete('liff.state')
  url.searchParams.delete('id')
  url.searchParams.delete('pet')
  return `${url.pathname}${url.search}${url.hash}`
}
