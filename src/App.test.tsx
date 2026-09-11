import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { currentCustomerId, initialOrders, items } from './data/demo'
import type { CampaignContent } from './services/demoCampaignStore'

describe('customer campaign app', () => {
  it('shows the verified campaign progress and visible order wall', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '一涼製冰所 超厚三明治冰餅' })).toBeInTheDocument()
    expect(screen.getByText('62 個 / 100 個')).toBeInTheDocument()
    expect(screen.getByText('還差 38 個成團')).toBeInTheDocument()
    expect(screen.getByText('斯祈')).toBeInTheDocument()
    expect(screen.getByText('佩怡')).toBeInTheDocument()
  })

  it('uses the published quantity unit in progress, totals and capacity warnings', async () => {
    const user = userEvent.setup()
    render(<App publishedContent={{
      title: '盒裝點心', unitPrice: 45, threshold: 63, quantityUnit: '盒', announcement: '公告', images: [], items,
      openedAt: '2026-08-14T00:05:09.000Z',
    }} />)

    expect(screen.getByText('62 盒 / 63 盒')).toBeInTheDocument()
    expect(screen.getByText('還差 1 盒成團')).toBeInTheDocument()
    expect(screen.getByText('我的訂單 6 盒')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '增加 C 抹茶' }))
    await user.click(screen.getByRole('button', { name: '增加 C 抹茶' }))
    expect(screen.getByText(/此訂單最多可保留 7 盒，請減少 1 盒/)).toBeInTheDocument()
  })

  it('submits resident custom items separately without changing price or threshold quantity', async () => {
    const user = userEvent.setup()
    const onSubmitOrder = vi.fn().mockResolvedValue(undefined)
    render(<App onSubmitOrder={onSubmitOrder} publishedContent={{
      title: '可自訂品項', unitPrice: 45, threshold: 100, allowCustomItems: true,
      announcement: '公告', images: [], items, openedAt: '2026-08-14T00:05:09.000Z',
    }} />)

    expect(screen.getByText('62 個 / 100 個')).toBeInTheDocument()
    expect(screen.getByText('$270')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新增額外品項' }))
    await user.type(screen.getByRole('textbox', { name: '額外品項 1 名稱' }), '限定蛋糕')
    await user.click(screen.getByRole('button', { name: '增加 額外品項 1' }))
    await user.click(screen.getByRole('button', { name: '增加 額外品項 1' }))

    expect(screen.getByText('金額由團主另計')).toBeInTheDocument()
    expect(screen.getByText('62 個 / 100 個')).toBeInTheDocument()
    expect(screen.getByText('$270')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '送出訂單' }))
    expect(onSubmitOrder).toHaveBeenCalledWith(expect.any(Object), [
      expect.objectContaining({ name: '限定蛋糕', quantity: 2 }),
    ])
  })

  it('locks every order control while a custom order submission is pending', async () => {
    const user = userEvent.setup()
    let finishSubmit!: () => void
    const onSubmitOrder = vi.fn(() => new Promise<void>((resolve) => { finishSubmit = resolve }))
    render(<App
      publishedContent={{
        title: '送出鎖定測試', unitPrice: 45, threshold: 100, allowCustomItems: true,
        announcement: '公告', images: [], items, openedAt: '2026-09-11T00:00:00.000Z',
      }}
      onSubmitOrder={onSubmitOrder}
    />)

    await user.click(screen.getByRole('button', { name: '新增額外品項' }))
    const input = screen.getByRole('textbox', { name: '額外品項 1 名稱' })
    await user.type(input, '限定蛋糕')
    await user.click(screen.getByRole('button', { name: '增加 額外品項 1' }))
    await user.click(screen.getByRole('button', { name: '送出訂單' }))

    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: '新增額外品項' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '增加 額外品項 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '移除額外品項 1' })).toBeDisabled()

    await act(async () => { finishSubmit() })
    await screen.findByText('訂單已更新')
  })

  it('does not let a resident remove historical custom items after closing', () => {
    render(<App
      publishedContent={{
        title: '結單鎖定測試', unitPrice: 45, threshold: 100, allowCustomItems: true,
        announcement: '公告', images: [], items, openedAt: '2026-09-11T00:00:00.000Z',
      }}
      campaignStatus="closed"
      visibleOrders={initialOrders.map((order) => order.customerId === currentCustomerId
        ? { ...order, customItems: [{ id: 'custom-closed', name: '歷史蛋糕', quantity: 2 }] }
        : order)}
    />)

    expect(screen.getByRole('button', { name: '移除額外品項 1' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '額外品項 1 名稱' })).toBeDisabled()
  })

  it('shows custom items on the live order wall as unpriced additions', () => {
    render(<App
      publishedContent={{
        title: '訂單牆自訂品項', unitPrice: 45, threshold: 100, allowCustomItems: true,
        announcement: '公告', images: [], items, openedAt: '2026-08-14T00:05:09.000Z',
      }}
      visibleOrders={initialOrders.map((order, index) => index === 1
        ? { ...order, customItems: [{ id: 'custom-wall', name: '隱藏版口味', quantity: 3 }] }
        : order)}
    />)

    expect(screen.getByText(/隱藏版口味×3（另計）/)).toBeInTheDocument()
    expect(screen.getByText(/另有 3 個額外品項/)).toBeInTheDocument()
    expect(screen.getByText('62 個 / 100 個')).toBeInTheDocument()
  })

  it('does not leak the fixed demo arrival copy into live content', () => {
    render(<App liveDemo />)

    expect(screen.queryByText('🧊 貨到通知')).not.toBeInTheDocument()
  })

  it('clamps accessible progress after the campaign exceeds its threshold', () => {
    render(<App publishedContent={{
      title: '超額成團', unitPrice: 45, threshold: 1, announcement: '公告', images: [], items,
      openedAt: '2026-08-14T00:05:09.000Z',
    }} />)

    expect(screen.getByRole('progressbar', { name: '成團進度' })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByRole('progressbar', { name: '成團進度' })).toHaveAttribute('aria-valuemax', '1')
  })

  it('shows total-amount progress without presenting it as an automatic close target', () => {
    render(<App publishedContent={{
      title: '金額成團', unitPrice: 45, threshold: 1, thresholdKind: 'amount', amountThreshold: 5000,
      announcement: '公告', images: [], items, openedAt: '2026-08-14T00:05:09.000Z',
    }} />)

    expect(screen.getByText('NT$ 2,790 / NT$ 5,000')).toBeInTheDocument()
    expect(screen.getByText('還差 NT$ 2,210 成團')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '成團進度' })).toHaveAttribute('aria-valuenow', '2790')
  })

  it('shows the organizer announcement and campaign image above ordering', () => {
    const { rerender } = render(<App />)

    expect(screen.getByText(/🌞炎炎夏日 #冰品最佳首選🧊🍦/)).toBeInTheDocument()
    expect(screen.getByText(/🉐🉐美味代購價一個\$４５元🉐🉐/)).toBeInTheDocument()
    expect(screen.getByText(/保存期限:冷凍約三個月/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '超厚三明治冰餅口味示意圖' })).toBeInTheDocument()
    expect(screen.queryByText(/左右滑動查看/u)).not.toBeInTheDocument()

    rerender(<App publishedContent={{
      title: '多圖團購', unitPrice: 45, threshold: 10, announcement: '多圖公告', items,
      images: [{ src: '/one.jpg', alt: '第一張' }, { src: '/two.jpg', alt: '第二張' }],
      openedAt: '2026-08-14T00:05:09.000Z',
    }} />)
    expect(screen.getByText('← 左右滑動查看 2 張圖片 →')).toBeInTheDocument()
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

  it('places product information before the resident order flow', () => {
    render(<App />)

    const orderHeading = screen.getByRole('heading', { name: /二期 2K13/ })
    const announcementHeading = screen.getByRole('heading', { name: '開團資訊' })
    expect(announcementHeading.compareDocumentPosition(orderHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lets the signed-in customer update only their own order', async () => {
    const user = userEvent.setup()
    render(<App />)

    const submitOrder = screen.getByRole('button', { name: '送出訂單' })
    expect(submitOrder).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '增加 A 牛奶（招牌）' }))
    expect(screen.getByText('我的訂單 7 個')).toBeInTheDocument()
    expect(screen.getByText('$315')).toBeInTheDocument()
    expect(submitOrder).toBeEnabled()

    await user.click(submitOrder)
    expect(screen.getByText('63 個 / 100 個')).toBeInTheDocument()
    const successToast = screen.getByText('訂單已更新').closest('[role="status"]')
    expect(successToast).toHaveClass('resident-order-toast')
    expect(submitOrder).toBeDisabled()
  })

  it('disables submission again when quantity changes are reverted', async () => {
    const user = userEvent.setup()
    render(<App />)

    const submitOrder = screen.getByRole('button', { name: '送出訂單' })
    await user.click(screen.getByRole('button', { name: '增加 A 牛奶（招牌）' }))
    expect(submitOrder).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '減少 A 牛奶（招牌）' }))
    expect(submitOrder).toBeDisabled()
  })

  it('warns immediately when a quantity change would exceed the formation threshold', async () => {
    const user = userEvent.setup()
    render(<App publishedContent={{
      title: '限量團購', unitPrice: 45, threshold: 63, thresholdKind: 'quantity', amountThreshold: null,
      announcement: '公告', images: [], items, openedAt: '2026-08-14T00:05:09.000Z',
    }} />)

    await user.click(screen.getByRole('button', { name: '增加 C 抹茶' }))
    await user.click(screen.getByRole('button', { name: '增加 C 抹茶' }))

    expect(screen.getByRole('alert')).toHaveTextContent('此訂單最多可保留 7 個，請減少 1 個')
    expect(screen.getByRole('status', { name: 'C 抹茶數量' })).toHaveTextContent('1')
  })

  it('keeps order totals and the only submit action together', () => {
    render(<App />)

    const orderAction = screen.getByRole('region', { name: '訂單摘要與送出' })
    expect(within(orderAction).getByText('6 個')).toBeInTheDocument()
    expect(within(orderAction).getByText('$270')).toBeInTheDocument()
    expect(within(orderAction).getByRole('button', { name: '送出訂單' })).toBeDisabled()
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

    await user.click(screen.getByRole('button', { name: '增加 A 牛奶（招牌）' }))
    await user.click(screen.getByRole('button', { name: '送出訂單' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('目前無法更新訂單')
    expect(screen.getByText('7 個')).toBeInTheDocument()
  })

  it('lets an unbound resident choose a complete phase-three household before ordering', async () => {
    const user = userEvent.setup()
    const onBindResident = vi.fn().mockResolvedValue({
      customerId: 'new-customer', name: '彭梓育', period: 3, unit: '3Z15',
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
    expect(screen.getByRole('option', { name: '三期' })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: '期別' }), '3')
    await user.selectOptions(screen.getByRole('combobox', { name: '前段' }), '3')
    await user.selectOptions(screen.getByRole('combobox', { name: '棟別' }), 'Z')
    await user.selectOptions(screen.getByRole('combobox', { name: '號碼' }), '15')
    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))

    expect(onBindResident).toHaveBeenCalledWith({ period: 3, unit: '3Z15' })
    expect(await screen.findByRole('button', { name: '增加 A 牛奶（招牌）' })).toBeInTheDocument()
  })

  it('hides the prefix for phase one and binds only the letter and number', async () => {
    const user = userEvent.setup()
    const onBindResident = vi.fn().mockResolvedValue({
      customerId: 'customer-phase-one',
      name: '彭梓育',
      period: 1,
      unit: 'Z15',
    })
    render(
      <App
        visibleOrders={[]}
        residentCustomer={null}
        verifiedResidentIdentity={{ displayName: '彭梓育', pictureUrl: null }}
        onBindResident={onBindResident}
      />,
    )

    await user.selectOptions(screen.getByRole('combobox', { name: '期別' }), '1')
    expect(screen.queryByRole('combobox', { name: '前段' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: '棟別' }), 'Z')
    await user.selectOptions(screen.getByRole('combobox', { name: '號碼' }), '15')
    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))

    expect(onBindResident).toHaveBeenCalledWith({ period: 1, unit: 'Z15' })
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

    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('這個戶號已被綁定')
  })

  it('shows a closed campaign and disables every order control', () => {
    render(<App campaignStatus="closed" />)

    expect(screen.getByText('已結單')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '送出訂單' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '增加 A 牛奶（招牌）' })).toBeDisabled()
    expect(screen.getByText('本團已結單，暫停修改訂單。')).toBeInTheDocument()
  })

  it('shows item names and prices without 號 and uses plus signs on the live wall', () => {
    const content: CampaignContent = {
      title: '自訂品項團',
      unitPrice: 45,
      threshold: 100,
      announcement: '自訂公告',
      images: [],
      items: [
        { code: 'A', name: '牛奶', unitPrice: 45, active: true },
        { code: 'B', name: '草莓', unitPrice: 60, active: true },
      ],
      openedAt: '2026-08-14T00:05:09.000Z',
    }
    const resident = initialOrders[0]
    const visibleOrders = [
      { ...resident, items: { A: 2, B: 1 } },
      {
        ...initialOrders[1],
        customerId: 'customer-phase-three',
        name: '三期住戶',
        period: 3,
        unit: '3Z15',
        items: { A: 1, B: 0 },
      },
    ]

    render(<App publishedContent={content} visibleOrders={visibleOrders} residentCustomer={resident} />)

    expect(screen.getByText('牛奶')).toBeInTheDocument()
    expect(screen.getByText('$45')).toBeInTheDocument()
    expect(screen.getByText('草莓')).toBeInTheDocument()
    expect(screen.getByText('$60')).toBeInTheDocument()
    expect(screen.getByText('$150')).toBeInTheDocument()
    expect(screen.getByText('A+2、B+1')).toBeInTheDocument()
    expect(screen.getByText('三期 3Z15')).toBeInTheDocument()
    expect(screen.queryByText(/A號|B號/)).not.toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: '增加 A 牛奶（招牌）' }))
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
