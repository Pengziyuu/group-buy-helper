import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { initialOrders } from './data/demo'
import type { CampaignContent } from './services/demoCampaignStore'

describe('customer campaign app', () => {
  it('shows the verified campaign progress and visible order wall', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '一涼製冰所 超厚三明治冰餅' })).toBeInTheDocument()
    expect(screen.getByText('62 / 100')).toBeInTheDocument()
    expect(screen.getByText('還差 38 個成團')).toBeInTheDocument()
    expect(screen.getByText('斯祈')).toBeInTheDocument()
    expect(screen.getByText('佩怡')).toBeInTheDocument()
  })

  it('shows the organizer announcement and campaign image above ordering', () => {
    render(<App />)

    expect(screen.getByText(/🌞炎炎夏日 #冰品最佳首選🧊🍦/)).toBeInTheDocument()
    expect(screen.getByText(/🉐🉐美味代購價一個\$４５元🉐🉐/)).toBeInTheDocument()
    expect(screen.getByText(/保存期限:冷凍約三個月/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '超厚三明治冰餅口味示意圖' })).toBeInTheDocument()
  })

  it('lets the signed-in customer update only their own order', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '增加 A號' }))
    expect(screen.getByText('我的訂單 7 個')).toBeInTheDocument()
    expect(screen.getByText('$315')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '送出訂單' }))
    expect(screen.getByText('63 / 100')).toBeInTheDocument()
    expect(screen.getByText('訂單已更新')).toBeInTheDocument()
  })

  it('shows a closed campaign and disables every order control', () => {
    render(<App campaignStatus="closed" />)

    expect(screen.getByText('已結單')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '送出訂單' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '增加 A號' })).toBeDisabled()
    expect(screen.getByText('本團已結單，暫停修改訂單。')).toBeInTheDocument()
  })

  it('renders only dynamic active items while retaining inactive historical names', () => {
    const content: CampaignContent = {
      title: '自訂品項團',
      unitPrice: 45,
      threshold: 100,
      announcement: '自訂公告',
      images: [],
      items: [
        { code: 'B', name: '停售花生', active: false },
        { code: 'CUSTOM', name: '住戶可選新品', active: true },
      ],
      openedAt: '2026-08-14T00:05:09.000Z',
    }

    render(<App publishedContent={content} />)

    expect(screen.getByRole('button', { name: '增加 B號' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '增加 A號' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '增加 A號' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/A號×/).length).toBeGreaterThan(0)
  })

  it('shows campaign and order timestamps with meaningful edit markers', () => {
    render(<App />)

    expect(screen.getByText('開團時間 2026/08/14 08:05')).toBeInTheDocument()
    expect(screen.getByText('下單時間 2026/08/14 08:10')).toBeInTheDocument()
    expect(screen.getByText('已修改・最後修改 2026/08/14 08:12')).toBeInTheDocument()
  })

  it('preserves an unsent draft when another household updates through Realtime', async () => {
    const user = userEvent.setup()
    const resident = initialOrders[0]
    const onSubmitOrder = async () => undefined
    const view = render(
      <App visibleOrders={initialOrders} residentCustomer={resident} onSubmitOrder={onSubmitOrder} />,
    )

    await user.click(screen.getByRole('button', { name: '增加 A號' }))
    expect(screen.getByText('我的訂單 7 個')).toBeInTheDocument()

    view.rerender(
      <App
        visibleOrders={initialOrders.map((order, index) => index === 1
          ? { ...order, updatedAt: '2026-08-14T01:30:00Z' }
          : order)}
        residentCustomer={resident}
        onSubmitOrder={onSubmitOrder}
      />,
    )
    expect(screen.getByText('我的訂單 7 個')).toBeInTheDocument()
  })
})
