import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ResidentCampaignListApp from './ResidentCampaignListApp'

describe('ResidentCampaignListApp', () => {
  it('shows verified LINE identity and all published campaigns as notebook entries', async () => {
    const user = userEvent.setup()
    const onLogout = vi.fn()
    render(
      <ResidentCampaignListApp
        identity={{ displayName: '彭梓育', pictureUrl: 'https://example.com/avatar.jpg' }}
        campaigns={[
          {
            slug: '0123456789abcdef0123456789abcdef0123',
            title: '早餐團購',
            status: 'open',
            unitPrice: 55,
            openedAt: '2026-08-14T08:00:00.000Z',
            totalQuantity: 8,
            threshold: 10,
          },
          {
            slug: 'abcdef0123456789abcdef0123456789abcd',
            title: '水果團購',
            status: 'closed',
            unitPrice: 120,
            openedAt: '2026-08-13T08:00:00.000Z',
            totalQuantity: 12,
            threshold: 12,
          },
        ]}
        onLogout={onLogout}
      />,
    )

    expect(screen.getByRole('heading', { name: '全部開團' })).toBeInTheDocument()
    expect(screen.getByText('彭梓育')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '彭梓育的LINE頭貼' })).toHaveAttribute('src', 'https://example.com/avatar.jpg')
    expect(screen.getByRole('link', { name: '查看早餐團購' })).toHaveAttribute('href', '/campaign/0123456789abcdef0123456789abcdef0123')
    expect(screen.getByText('收單中')).toBeInTheDocument()
    expect(screen.getByText('已結單')).toBeInTheDocument()
    expect(screen.getByText('成團進度 8 / 10')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '登出' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('prioritizes open campaigns and exposes meaningful progress', () => {
    render(
      <ResidentCampaignListApp
        identity={{ displayName: '彭梓育', pictureUrl: null }}
        campaigns={[
          {
            slug: 'closed-campaign', title: '已結束水果團', status: 'closed', unitPrice: 120,
            openedAt: '2026-08-13T08:00:00.000Z', totalQuantity: 12, threshold: 12,
          },
          {
            slug: 'open-campaign', title: '今天可下單早餐團', status: 'open', unitPrice: 55,
            openedAt: '2026-08-14T08:00:00.000Z', totalQuantity: 8, threshold: 10,
          },
        ]}
      />,
    )

    const entries = screen.getAllByRole('article')
    expect(within(entries[0]).getByRole('heading', { name: '今天可下單早餐團' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '今天可下單早餐團成團進度' })).toHaveAttribute('aria-valuenow', '8')
  })
})
