import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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

  it('does not leak the fixed demo arrival copy into live content', () => {
    render(<App liveDemo />)

    expect(screen.queryByText('🧊 貨到通知')).not.toBeInTheDocument()
  })

  it('clamps accessible progress after the campaign exceeds its threshold', () => {
    render(<App publishedContent={{
      title: '超額成團', unitPrice: 45, threshold: 1, announcement: '公告', images: [], items: [],
      openedAt: '2026-08-14T00:05:09.000Z',
    }} />)

    expect(screen.getByRole('progressbar', { name: '成團進度' })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByRole('progressbar', { name: '成團進度' })).toHaveAttribute('aria-valuemax', '1')
  })

  it('shows the organizer announcement and campaign image above ordering', () => {
    render(<App />)

    expect(screen.getByText(/🌞炎炎夏日 #冰品最佳首選🧊🍦/)).toBeInTheDocument()
    expect(screen.getByText(/🉐🉐美味代購價一個\$４５元🉐🉐/)).toBeInTheDocument()
    expect(screen.getByText(/保存期限:冷凍約三個月/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '超厚三明治冰餅口味示意圖' })).toBeInTheDocument()
  })

  it('provides in-app navigation and lets residents expand a long announcement', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('link', { name: '回到全部開團' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '前往我的訂單' })).toHaveAttribute('href', '#order-heading')
    const toggle = screen.getByRole('button', { name: '展開完整開團資訊' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(screen.getByRole('button', { name: '收合開團資訊' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('places the resident order flow before the full organizer announcement', () => {
    render(<App />)

    const orderHeading = screen.getByRole('heading', { name: /二期 2K13/ })
    const announcementHeading = screen.getByRole('heading', { name: '開團資訊' })
    expect(orderHeading.compareDocumentPosition(announcementHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  it('keeps order totals and the only submit action together', () => {
    render(<App />)

    const orderAction = screen.getByRole('region', { name: '訂單摘要與送出' })
    expect(within(orderAction).getByText('6 個')).toBeInTheDocument()
    expect(within(orderAction).getByText('$270')).toBeInTheDocument()
    expect(within(orderAction).getByRole('button', { name: '送出訂單' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '送出訂單' })).toHaveLength(1)
  })

  it('shows order submission failures as an alert and keeps the draft', async () => {
    const user = userEvent.setup()
    const resident = initialOrders[0]
    render(
      <App
        visibleOrders={initialOrders}
        residentCustomer={resident}
        onSubmitOrder={vi.fn().mockRejectedValue(new Error('目前無法更新訂單'))}
      />,
    )

    await user.click(screen.getByRole('button', { name: '增加 A號' }))
    await user.click(screen.getByRole('button', { name: '送出訂單' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('目前無法更新訂單')
    expect(screen.getByText('7 個')).toBeInTheDocument()
  })

  it('lets an unbound resident create their household profile before ordering', async () => {
    const user = userEvent.setup()
    const onBindResident = vi.fn().mockResolvedValue({
      customerId: 'new-customer', name: '彭梓育', period: 2, unit: 'A01',
    })

    render(
      <App
        visibleOrders={[]}
        residentCustomer={null}
        verifiedResidentIdentity={{ displayName: '彭梓育', pictureUrl: 'https://example.com/avatar.jpg' }}
        onBindResident={onBindResident}
      />,
    )

    expect(screen.getByRole('heading', { name: '首次填寫住戶資料' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '姓名' })).not.toBeInTheDocument()
    expect(screen.getByText('彭梓育')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '彭梓育的LINE頭貼' })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: '期別' }), '2')
    await user.type(screen.getByRole('textbox', { name: '戶號' }), 'a01')
    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))

    expect(onBindResident).toHaveBeenCalledWith({ period: 2, unit: 'A01' })
    expect(await screen.findByRole('button', { name: '增加 A號' })).toBeInTheDocument()
  })

  it('shows resident binding failures as an inline alert', async () => {
    const user = userEvent.setup()
    render(
      <App
        visibleOrders={[]}
        residentCustomer={null}
        verifiedResidentIdentity={{ displayName: '彭梓育', pictureUrl: null }}
        onBindResident={vi.fn().mockRejectedValue(new Error('這個戶號已被綁定'))}
      />,
    )

    await user.type(screen.getByRole('textbox', { name: '戶號' }), 'A01')
    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('這個戶號已被綁定')
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

  it('keeps the order page mounted when realtime sync degrades', async () => {
    const user = userEvent.setup()
    const onSyncRetry = vi.fn()
    render(<App syncError="即時同步暫時中斷" onSyncRetry={onSyncRetry} />)

    expect(screen.getByRole('heading', { name: '一涼製冰所 超厚三明治冰餅' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('即時同步暫時中斷')
    await user.click(screen.getByRole('button', { name: '重新同步' }))
    expect(onSyncRetry).toHaveBeenCalledOnce()
  })
})
