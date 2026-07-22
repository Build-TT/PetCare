import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('application root navigation', () => {
  it('mounts only the approved primary navigation', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    window.localStorage.setItem('petcare.account-session.v1', JSON.stringify({ session_token: 'test-session', user: { username: 'test', role: 'user' } }))
    window.history.replaceState({}, '', '/?page=settings')

    let appModule
    await act(async () => {
      appModule = await import('./main.jsx')
    })

    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'สมุดบันทึก' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'ยา' })).toBeNull()
    expect(screen.getByRole('button', { name: /Google Sheet/ })).toBeTruthy()
    expect(screen.queryByLabelText('Google Sheet connection')).toBeNull()
    expect(appModule.resolveRoute('?page=track')).toEqual({ kind: 'main', page: 'track' })
    expect(appModule.resolveRoute('?page=settings')).toEqual({ kind: 'main', page: 'settings' })
    for (const page of ['home', 'track', 'diary', 'reminders', 'settings']) {
      expect(appModule.resolveRoute(`?page=${page}`)).toEqual({ kind: 'main', page })
    }
    for (const kind of ['log', 'pets', 'meds', 'types']) {
      expect(appModule.resolveRoute(`?page=${kind}`)).toEqual({ kind })
    }
    expect(appModule.resolveRoute('?page=pets')).toEqual({ kind: 'pets' })
    expect(appModule.resolveRoute('?liff.state=%3Fpage%3Dpet%26id%3Dp1')).toEqual({ kind: 'pet', petId: 'p1' })
    expect(appModule.resolveRoute('?liff.state=%25broken&page=settings')).toEqual({ kind: 'main', page: 'settings' })
  })
})
