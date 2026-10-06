import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ResidentTabBar } from './ResidentTabBar'

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
    window.dispatchEvent(new Event('scroll'))
  })
}

describe('ResidentTabBar', () => {
  afterEach(() => scrollTo(0))

  it('slides away while scrolling down the list and comes back on any scroll up', () => {
    render(<ResidentTabBar current="campaigns" />)
    const tabs = screen.getByRole('navigation', { name: '住戶頁面' })
    expect(tabs).not.toHaveAttribute('data-hidden')

    scrollTo(40)
    // Near the top the bar stays, so it is there when the page opens.
    expect(tabs).not.toHaveAttribute('data-hidden')
    scrollTo(300)
    expect(tabs).toHaveAttribute('data-hidden', 'true')
    scrollTo(296)
    // A few pixels of jitter does not count as scrolling back up.
    expect(tabs).toHaveAttribute('data-hidden', 'true')
    scrollTo(260)
    expect(tabs).not.toHaveAttribute('data-hidden')
  })
})
