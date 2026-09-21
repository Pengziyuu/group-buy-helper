import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ResidentCampaignListApp, { type ResidentCampaignListItem } from './ResidentCampaignListApp'

const identity = { displayName: '彭梓育', pictureUrl: 'https://example.com/avatar.jpg' }

function campaign(overrides: Partial<ResidentCampaignListItem> & Pick<ResidentCampaignListItem, 'slug' | 'title'>): ResidentCampaignListItem {
  return {
    status: 'open',
    unitPrice: 55,
    openedAt: '2026-08-14T08:00:00.000Z',
    totalQuantity: 8,
    threshold: 10,
    ...overrides,
  }
}

describe('ResidentCampaignListApp', () => {
  it('lists open campaigns before closed ones with price, progress and schedule', () => {
    render(
      <ResidentCampaignListApp
        identity={identity}
        now={new Date('2026-09-01T00:00:00.000Z')}
        campaigns={[
          campaign({
            slug: '0123456789abcdef0123456789abcdef0123', title: '早餐團購', totalAmount: 440,
            thresholdKind: 'amount', amountThreshold: 1000, arrivalLabel: '03/08', autoCloseAt: '2027-03-05T04:00:00.000Z',
            images: [
              { src: 'https://example.com/breakfast-cover.jpg', alt: '早餐商品照片' },
              { src: 'https://example.com/breakfast-detail.jpg', alt: '早餐細節照片' },
            ],
          }),
          campaign({
            slug: 'abcdef0123456789abcdef0123456789abcd', title: '水果團購', status: 'closed', unitPrice: 120,
            openedAt: '2026-08-13T08:00:00.000Z', totalQuantity: 12, threshold: 12, quantityUnit: '箱', arrivalLabel: '貨到通知',
          }),
        ]}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: '團購' })).toBeInTheDocument()
    expect(screen.getByText('1 團開團中')).toHaveClass('resident-list-count')

    const open = screen.getByRole('region', { name: '開團中' })
    expect(within(open).getByRole('heading', { name: '開團中' })).not.toHaveClass('ui-visually-hidden')
    expect(within(open).getByRole('link', { name: '早餐團購' })).toHaveAttribute('href', '/campaign/0123456789abcdef0123456789abcdef0123')
    expect(within(open).getByRole('img', { name: '早餐商品照片' })).toHaveAttribute('src', 'https://example.com/breakfast-cover.jpg')
    expect(within(open).queryByRole('img', { name: '早餐細節照片' })).not.toBeInTheDocument()
    expect(within(open).getByText('$55')).toBeInTheDocument()
    expect(within(open).getByText('NT$ 440 / NT$ 1,000')).toBeInTheDocument()
    expect(within(open).getByText('3/5（五）12:00 結單')).toBeInTheDocument()
    expect(within(open).getByText('到貨：03/08')).toBeInTheDocument()
    expect(within(open).getByRole('progressbar', { name: '早餐團購成團進度' })).toHaveAttribute('aria-valuenow', '440')

    const closed = screen.getByRole('region', { name: '已結單' })
    expect(within(closed).getByRole('link', { name: '水果團購' })).toBeInTheDocument()
    expect(within(closed).getByText('已結單', { selector: '.ui-status-badge' })).toBeInTheDocument()
    expect(within(closed).getByText('12 箱 / 12 箱')).toBeInTheDocument()
    expect(within(closed).getByText('到貨：貨到通知')).toBeInTheDocument()
    expect(within(closed).getByRole('img', { name: '水果團購尚未設定商品圖片' })).toBeInTheDocument()

    const titles = screen.getAllByRole('link').map((link) => link.textContent)
    expect(titles).toEqual(['早餐團購', '水果團購'])
  })

  it('orders each group by the newest opening and treats arrived campaigns as closed', () => {
    render(
      <ResidentCampaignListApp
        identity={identity}
        campaigns={[
          campaign({ slug: 'open-old', title: '舊的開團', openedAt: '2026-08-01T08:00:00.000Z' }),
          campaign({ slug: 'arrived', title: '到貨的團', status: 'arrived', openedAt: '2026-08-20T08:00:00.000Z' }),
          campaign({ slug: 'open-new', title: '新的開團', openedAt: '2026-08-10T08:00:00.000Z' }),
          campaign({ slug: 'closed', title: '結單的團', status: 'closed', openedAt: '2026-08-05T08:00:00.000Z' }),
        ]}
      />,
    )

    expect(within(screen.getByRole('region', { name: '開團中' })).getAllByRole('link').map((link) => link.textContent))
      .toEqual(['新的開團', '舊的開團'])
    expect(within(screen.getByRole('region', { name: '已結單' })).getAllByRole('link').map((link) => link.textContent))
      .toEqual(['到貨的團', '結單的團'])
    expect(screen.queryByText(/已到貨/)).not.toBeInTheDocument()
  })

  it('highlights campaigns that close today or tomorrow', () => {
    render(
      <ResidentCampaignListApp
        identity={identity}
        now={new Date('2026-09-25T01:00:00.000Z')}
        campaigns={[
          campaign({ slug: 'today', title: '今天結單團', autoCloseAt: '2026-09-25T04:00:00.000Z' }),
          campaign({ slug: 'tomorrow', title: '明天結單團', autoCloseAt: '2026-09-26T04:00:00.000Z' }),
        ]}
      />,
    )

    expect(screen.getByText('今天 12:00 結單')).toHaveClass('is-soon')
    expect(screen.getByText('明天 12:00 結單')).toHaveClass('is-soon')
  })

  it('shows the five newest closed campaigns until asked for older ones', async () => {
    const user = userEvent.setup()
    render(
      <ResidentCampaignListApp
        identity={identity}
        campaigns={Array.from({ length: 7 }, (_, index) => campaign({
          slug: `closed-${index}`, title: `結單團 ${index + 1}`, status: 'closed',
          openedAt: new Date(Date.UTC(2026, 7, 20 - index)).toISOString(),
        }))}
      />,
    )

    const closed = screen.getByRole('region', { name: '已結單' })
    expect(within(closed).getAllByRole('link')).toHaveLength(5)
    expect(screen.getByText('目前沒有開團中的團購')).toBeInTheDocument()
    await user.click(within(closed).getByRole('button', { name: '顯示更早的團購（2）' }))
    expect(within(closed).getAllByRole('link')).toHaveLength(7)
  })

  it('signs out from the LINE account menu', async () => {
    const user = userEvent.setup()
    const onLogout = vi.fn()
    const { container } = render(<ResidentCampaignListApp identity={identity} campaigns={[]} onLogout={onLogout} />)

    const account = screen.getByRole('button', { name: 'LINE 帳號：彭梓育' })
    expect(container.querySelector('.resident-account-menu img')).toHaveAttribute('src', 'https://example.com/avatar.jpg')
    await user.click(account)
    await user.click(screen.getByRole('menuitem', { name: '登出' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('explains an empty list', () => {
    render(<ResidentCampaignListApp identity={{ displayName: '彭梓育', pictureUrl: null }} campaigns={[]} />)

    expect(screen.getByRole('img', { name: 'LINE 帳號：彭梓育' })).toBeInTheDocument()
    expect(screen.getByText('目前還沒有團購')).toBeInTheDocument()
  })
})
