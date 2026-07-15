import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('application root navigation', () => {
  it('mounts only the approved primary navigation', async () => {
    document.body.innerHTML = '<div id="root"></div>'

    await act(async () => {
      await import('./main.jsx')
    })

    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'ติดตาม' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'ยา' })).toBeNull()
  })
})
