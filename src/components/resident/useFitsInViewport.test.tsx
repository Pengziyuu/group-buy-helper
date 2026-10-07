import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFitsInViewport } from './useFitsInViewport'

function Probe({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const fits = useFitsInViewport(ref, 84, enabled)
  return <div ref={ref} data-testid="box" data-fits={String(fits)} />
}

describe('useFitsInViewport', () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  afterEach(() => {
    vi.unstubAllGlobals()
    if (original) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original)
  })

  it('says whether the element at its full height fits the window, and follows it as it grows', () => {
    let resized = () => {}
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized = callback }
      observe() {}
      disconnect() {}
    })
    vi.stubGlobal('innerHeight', 800)
    let height = 600
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => height })

    render(<Probe />)
    // 800 high, less 84 for the top bar and a gap: 716 left.
    expect(screen.getByTestId('box')).toHaveAttribute('data-fits', 'true')

    height = 900
    act(() => resized())
    expect(screen.getByTestId('box')).toHaveAttribute('data-fits', 'false')

    height = 700
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(screen.getByTestId('box')).toHaveAttribute('data-fits', 'true')
  })

  it('assumes it fits where it is not measured: narrow screens, or no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 5000 })
    const { unmount } = render(<Probe />)
    expect(screen.getByTestId('box')).toHaveAttribute('data-fits', 'true')
    unmount()

    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    render(<Probe enabled={false} />)
    expect(screen.getByTestId('box')).toHaveAttribute('data-fits', 'true')
  })
})
