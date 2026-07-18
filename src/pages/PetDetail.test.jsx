import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PetDetail from './PetDetail.jsx'

describe('PetDetail error state', () => {
  it('shows a visible configuration error when LIFF is unavailable', async () => {
    render(<PetDetail petId="pet-1" />)
    expect((await screen.findByRole('alert')).textContent).toContain('LIFF ID')
  })
})
