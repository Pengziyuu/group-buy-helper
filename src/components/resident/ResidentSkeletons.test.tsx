import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResidentCampaignSkeleton, ResidentListSkeleton } from './ResidentSkeletons'

describe('resident skeletons', () => {
  it('draws the list page with its tabs, announcing only what is loading', () => {
    render(<ResidentListSkeleton page="orders" label="確認 LINE 住戶身分並載入我的訂單…" />)

    expect(screen.getByRole('status', { name: '確認 LINE 住戶身分並載入我的訂單…' })).toHaveAttribute('aria-busy', 'true')
    expect(within(screen.getByRole('navigation', { name: '住戶頁面' })).getByRole('link', { name: '我的訂單' }))
      .toHaveAttribute('aria-current', 'page')
  })

  it('carries on the sheen from where the outline in index.html has got to, rather than restarting it', () => {
    window.__skeletonStart = performance.now() - 2000
    try {
      const { container } = render(<ResidentListSkeleton page="campaigns" label="載入中" />)
      const delays = [...container.querySelectorAll<HTMLElement>('.sk-block')].map((block) => parseInt(block.style.animationDelay, 10))
      // 2000ms into a 1400ms sweep is 600ms into the current one.
      expect(delays.every((delay) => delay <= -600 && delay > -700)).toBe(true)
    } finally {
      delete window.__skeletonStart
    }
  })

  it('keeps the way back to all campaigns usable while a campaign loads', () => {
    render(<ResidentCampaignSkeleton label="連線住戶端即時資料…" />)

    expect(screen.getByRole('status', { name: '連線住戶端即時資料…' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /全部團購/ })).toHaveAttribute('href', '/')
  })
})
