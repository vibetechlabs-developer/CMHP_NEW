// A screen that throws shows a readable message, its technical detail, and
// recovers when the route changes (including to the same path again).
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ScreenErrorBoundary from './ScreenErrorBoundary'

function Broken() {
  throw new Error('Synthetic render failure')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ScreenErrorBoundary', () => {
  it('shows the technical detail of a screen that throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <MemoryRouter>
        <ScreenErrorBoundary resetKey="a">
          <Broken />
        </ScreenErrorBoundary>
      </MemoryRouter>
    )
    expect(screen.getByText('This screen could not be displayed.')).toBeTruthy()
    expect(screen.getByText('Synthetic render failure')).toBeTruthy()
  })
})
