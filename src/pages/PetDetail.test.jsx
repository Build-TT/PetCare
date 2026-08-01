import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PetDetail from './PetDetail.jsx'

describe('PetDetail error state', () => {
  it('shows a visible configuration error when LIFF is unavailable', async () => {
    render(<PetDetail petId="pet-1" />)
    // The page also renders the Google Sheet link, whose "OAuth not configured"
    // alert appears first, so wait for the LIFF alert by its own text.
    const liffError = await screen.findByText(/LIFF ID/)
    expect(liffError.closest('[role="alert"]')).toBeTruthy()
  })
})
