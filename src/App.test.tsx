import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { currentCustomerId, initialOrders, items } from './data/demo'
import type { CampaignContent } from './services/demoCampaignStore'

describe('customer campaign app', () => {
  afterEach(() => { vi.useRealTimers() })

  it('shows the verified campaign progress and visible order wall', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '一涼製冰所 超厚三明治冰餅' })).toBeInTheDocument()
    expect(screen.getByText('62 個 / 100 個')).toBeInTheDocument()
    expect(screen.getByText('還差 38 個成團')).toBeInTheDocument()
    expect(screen.getByText('已有 6 筆訂單・開團 2026/08/14 08:05')).toBeInTheDocument()
    expect(screen.queryByText(/戶參加/)).not.toBeInTheDocument()
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
    expect(within(screen.getByRole('region', { name: '訂單摘要與送出' })).getByText('6 盒')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '增加 C 抹茶' }))
    await user.click(screen.getByRole('button', { name: '增加 C 抹茶' }))
    expect(screen.getByText('目前其他住戶已訂 56 盒，成團上限為 63 盒，本次最多可訂 7 盒。')).toBeInTheDocument()
  })

  it('allows a formal item quantity to exceed twenty when campaign capacity remains', async () => {
    const user = userEvent.setup()
    const resident = { ...initialOrders[0], items: { A: 20 }, householdKind: 'resident' as const }
    render(<App
      residentCustomer={resident}
      visibleOrders={[resident]}
      publishedContent={{
        title: '大量訂購團', unitPrice: 45, threshold: 100, thresholdKind: 'quantity',
        announcement: '公告', images: [], items, openedAt: '2026-08-14T00:05:09.000Z',
      }}
    />)

    expect(screen.getByRole('status', { name: 'A 牛奶（招牌）數量' })).toHaveTextContent('20')
    await user.click(screen.getByRole('button', { name: '增加 A 牛奶（招牌）' }))
    expect(screen.getByRole('status', { name: 'A 牛奶（招牌）數量' })).toHaveTextContent('21')
  })

  it('previews base and mix-and-match prices while quantities change', async () => {
    const user = userEvent.setup()
    const resident = { customerId: 'resident-1', name: '住戶甲', period: 2, unit: '2A1', householdKind: 'resident' as const }
    const content: CampaignContent = {
      title: '肉品團購', unitPrice: 150, threshold: 100,
      baseDiscountRate: 0.9,
      mixMatchDiscount: { name: '任選三件85折', minimumQuantity: 3, rate: 0.85 },
      announcement: '公告', images: [], openedAt: '2026-09-12T00:00:00.000Z',
      items: [
        { code: 'A', name: '五花肉片', unitPrice: 170, active: true, discountEligible: true },
        { code: 'B', name: '高粱酒香腸', unitPrice: 299, active: true, discountEligible: true },
        { code: 'D', name: '梅花肉片', unitPrice: 180, active: true, discountEligible: false },
      ],
    }
    render(<App publishedContent={content} residentCustomer={resident} visibleOrders={[
      { ...resident, items: {}, orderedAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:00:00.000Z' },
    ]} />)

    const mixMatchSection = screen.getByRole('region', { name: '任選優惠專區' })
    const regularSection = screen.getByRole('region', { name: '其他商品' })
    expect(within(mixMatchSection).getByText('五花肉片')).toBeInTheDocument()
    expect(within(mixMatchSection).getByText('高粱酒香腸')).toBeInTheDocument()
    expect(within(mixMatchSection).queryByText('梅花肉片')).not.toBeInTheDocument()
    expect(within(regularSection).getByText('梅花肉片')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '增加 A 五花肉片' }))
    await user.click(screen.getByRole('button', { name: '增加 B 高粱酒香腸' }))
    expect(screen.getByText('再選1件即可享85折')).toBeInTheDocument()
    expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('$422')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '增加 A 五花肉片' }))
    expect(screen.getByText('已套用任選三件85折')).toBeInTheDocument()
    expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('$544')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '增加 C 梅花肉片' }))
    expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('$706')).toBeInTheDocument()
    expect(screen.getByText('任選價 $145')).toBeInTheDocument()
    expect(screen.getByText('9折價 $162')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '查看訂單明細' }))
    const review = screen.getByRole('dialog', { name: '訂單明細' })
    expect(within(review).getByText('五花肉片')).toBeInTheDocument()
    expect(within(review).getByText('2 × $145')).toBeInTheDocument()
    expect(within(review).getByText('$290')).toBeInTheDocument()
    expect(within(review).getAllByText('任選三件85折')).toHaveLength(2)
    expect(within(review).getByText('梅花肉片')).toBeInTheDocument()
    expect(within(review).getByText('1 × $162')).toBeInTheDocument()
    expect(within(review).getByText('商品合計')).toBeInTheDocument()
    expect(within(review).getByText('$706')).toBeInTheDocument()
    expect(within(review).getByText('已省 $113')).toBeInTheDocument()

    await user.click(within(review).getByRole('button', { name: '關閉訂單明細' }))
    expect(screen.queryByRole('dialog', { name: '訂單明細' })).not.toBeInTheDocument()
  })

  it('submits resident custom items separately without changing price or threshold quantity', async () => {
    const user = userEvent.setup()
    const onSubmitOrder = vi.fn().mockResolvedValue(undefined)
    render(<App onSubmitOrder={onSubmitOrder} publishedContent={{
      title: '可自訂品項', unitPrice: 45, threshold: 100, allowCustomItems: true,
      announcement: '公告', images: [], items, openedAt: '2026-08-14T00:05:09.000Z',
    }} />)

    expect(screen.getByText('62 個 / 100 個')).toBeInTheDocument()
    expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('$270')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新增額外品項' }))
    await user.type(screen.getByRole('textbox', { name: '額外品項 1 名稱' }), '限定蛋糕')
    await user.click(screen.getByRole('button', { name: '增加 額外品項 1' }))
    await user.click(screen.getByRole('button', { name: '增加 額外品項 1' }))

    expect(screen.getByText('金額由團主另計')).toBeInTheDocument()
    expect(screen.getByText('62 個 / 100 個')).toBeInTheDocument()
    expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('$270')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '送出訂單' }))
    expect(onSubmitOrder).toHaveBeenCalledWith(expect.any(Object), [
      expect.objectContaining({ name: '限定蛋糕', quantity: 2 }),
    ])
  })

  it('warns when an extra-item draft is missing its name, then clears the warning once it is filled in', async () => {
    const user = userEvent.setup()
    render(<App publishedContent={{
      title: '額外品項提示測試', unitPrice: 45, threshold: 100, allowCustomItems: true,
      announcement: '公告', images: [], items, openedAt: '2026-08-14T00:05:09.000Z',
    }} />)

    await user.click(screen.getByRole('button', { name: '新增額外品項' }))

    const bar = screen.getByLabelText('訂單摘要與送出')
    expect(within(bar).getByText('請填寫額外品項的名稱與數量。')).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: '送出訂單' })).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: '額外品項 1 名稱' }), '限定蛋糕')
    await user.click(screen.getByRole('button', { name: '增加 額外品項 1' }))

    expect(within(bar).queryByText('請填寫額外品項的名稱與數量。')).not.toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: '送出訂單' })).toBeEnabled()
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

  it('hides every household from the live wall while keeping the current household in my order', () => {
    const resident = { ...initialOrders[0], householdKind: 'resident' as const }
    const neighbor = {
      ...initialOrders[1],
      customerId: 'neighbor-customer',
      name: '鄰居住戶',
      period: 2,
      unit: '9Z9',
      householdKind: 'resident' as const,
    }
    render(<App residentCustomer={resident} visibleOrders={[resident, neighbor]} />)

    const wall = screen.getByRole('region', { name: '大家的訂單' })
    expect(within(wall).queryByText('二期 2K13')).not.toBeInTheDocument()
    expect(within(wall).queryByText('二期 9Z9')).not.toBeInTheDocument()
    expect(within(wall).getByText('斯祈')).toBeInTheDocument()
    expect(within(wall).getByText('鄰居住戶')).toBeInTheDocument()
    expect(screen.getByText('二期 2K13・斯祈')).toBeInTheDocument()
    expect(within(wall).getByText('（你）')).toBeInTheDocument()
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

  it('shows campaign images with the announcement and opens an accessible image viewer', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<App />)

    expect(screen.getByText(/🌞炎炎夏日 #冰品最佳首選🧊🍦/)).toBeInTheDocument()
    expect(screen.getByText(/🉐🉐美味代購價一個\$４５元🉐🉐/)).toBeInTheDocument()
    expect(screen.getByText(/保存期限:冷凍約三個月/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '超厚三明治冰餅口味示意圖' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /張圖片/ })).not.toBeInTheDocument()

    rerender(<App publishedContent={{
      title: '多圖團購', unitPrice: 45, threshold: 10, announcement: '多圖公告', items,
      images: [{ src: '/one.jpg', alt: '第一張' }, { src: '/two.jpg', alt: '第二張' }],
      openedAt: '2026-08-14T00:05:09.000Z',
    }} />)
    expect(screen.getByRole('group', { name: '共 2 張圖片' })).toBeInTheDocument()

    const mainImage = screen.getByRole('button', { name: '放大檢視 第 1 張圖片：第一張' })
    await user.click(mainImage)
    const dialog = screen.getByRole('dialog', { name: '圖片檢視 1／2' })
    const closeButton = screen.getByRole('button', { name: '關閉圖片檢視' })
    expect(closeButton).toHaveFocus()
    expect(document.body).toHaveStyle({ overflow: 'hidden' })
    expect(screen.getByRole('img', { name: '第一張（放大檢視）' })).toHaveAttribute('src', '/one.jpg')

    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '下一張圖片' })).toHaveFocus()
    await user.tab()
    expect(closeButton).toHaveFocus()

    const previousButton = screen.getByRole('button', { name: '上一張圖片' })
    const nextButton = screen.getByRole('button', { name: '下一張圖片' })
    previousButton.style.display = 'none'
    nextButton.style.display = 'none'
    closeButton.focus()
    await user.tab()
    expect(closeButton).toHaveFocus()
    previousButton.style.display = ''
    nextButton.style.display = ''

    const viewerStage = dialog.querySelector<HTMLElement>('.campaign-image-viewer-stage')!
    expect(within(viewerStage).getByRole('button', { name: '上一張圖片' })).toHaveClass('campaign-image-viewer-previous')
    expect(within(viewerStage).getByRole('button', { name: '下一張圖片' })).toHaveClass('campaign-image-viewer-next')
    fireEvent.pointerDown(viewerStage, { pointerId: 1, pointerType: 'touch', clientX: 280, clientY: 200 })
    fireEvent.pointerUp(viewerStage, { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 205 })
    expect(screen.getByRole('dialog', { name: '圖片檢視 2／2' })).toBeInTheDocument()
    fireEvent.pointerDown(viewerStage, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 80, clientY: 200 })
    fireEvent.pointerUp(viewerStage, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 280, clientY: 195 })
    expect(screen.getByRole('dialog', { name: '圖片檢視 2／2' })).toBeInTheDocument()
    fireEvent.pointerDown(viewerStage, { pointerId: 3, pointerType: 'touch', clientX: 280, clientY: 200 })
    fireEvent.pointerDown(viewerStage, { pointerId: 4, pointerType: 'touch', clientX: 220, clientY: 200 })
    fireEvent.pointerUp(viewerStage, { pointerId: 4, pointerType: 'touch', clientX: 80, clientY: 205 })
    fireEvent.pointerUp(viewerStage, { pointerId: 3, pointerType: 'touch', clientX: 300, clientY: 200 })
    expect(screen.getByRole('dialog', { name: '圖片檢視 2／2' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '上一張圖片' }))
    expect(screen.getByRole('dialog', { name: '圖片檢視 1／2' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一張圖片' }))
    expect(screen.getByRole('img', { name: '第二張（放大檢視）' })).toHaveAttribute('src', '/two.jpg')

    await user.click(dialog.parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body).not.toHaveStyle({ overflow: 'hidden' })
    expect(mainImage).toHaveFocus()

    await user.click(mainImage)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mainImage).toHaveFocus()

    await user.click(screen.getByRole('button', { name: '顯示第 2 張圖片' }))
    await user.click(screen.getByRole('button', { name: '放大檢視 第 2 張圖片：第二張' }))
    expect(screen.getByRole('dialog', { name: '圖片檢視 2／2' })).toBeInTheDocument()
    expect(document.body).toHaveStyle({ overflow: 'hidden' })
    rerender(<App publishedContent={{
      title: '多圖團購', unitPrice: 45, threshold: 10, announcement: '多圖公告', items, images: [],
      openedAt: '2026-08-14T00:05:09.000Z',
    }} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.body).not.toHaveStyle({ overflow: 'hidden' })
  })

  it('links back to the campaign list and lets residents expand a long announcement', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('link', { name: '全部團購' })).toHaveAttribute('href', '/')
    const toggle = screen.getByRole('button', { name: '展開全文' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(screen.getByRole('button', { name: '收合' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('places product information before the resident order flow', () => {
    render(<App />)

    const orderHeading = screen.getByRole('heading', { name: '我的訂單' })
    const announcementHeading = screen.getByRole('heading', { name: '開團資訊' })
    expect(announcementHeading.compareDocumentPosition(orderHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lets the signed-in customer update only their own order', async () => {
    // The success toast is removed 3500ms after it appears (App.tsx's notice
    // effect). With real timers this test races that removal: it only has to
    // lose 3.5s to a loaded machine between the click and the assertion below,
    // which is exactly how it failed intermittently. Fake timers make the
    // window unreachable instead of merely wide.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)

    const submitOrder = screen.getByRole('button', { name: '送出訂單' })
    expect(submitOrder).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '增加 A 牛奶（招牌）' }))
    expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('7 個')).toBeInTheDocument()
    expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('$315')).toBeInTheDocument()
    expect(submitOrder).toBeEnabled()

    await user.click(submitOrder)
    expect(screen.getByText('63 個 / 100 個')).toBeInTheDocument()
    const successToast = screen.getByText('訂單已更新').closest('[role="status"]')
    expect(successToast).toHaveClass('resident-order-toast')
    expect(submitOrder).toBeDisabled()
  })

  it('clears the success toast on fake time, so a stalled worker cannot lose it', async () => {
    // This is what makes the assertion above stall-proof. The 3.5s dismissal now
    // runs on fake time, which advances in small steps per event-loop tick. A
    // wall-clock stall runs no ticks, so it cannot consume the window the way it
    // could with real timers.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<App />)

    await user.click(screen.getByRole('button', { name: '增加 A 牛奶（招牌）' }))
    await user.click(screen.getByRole('button', { name: '送出訂單' }))
    expect(screen.getByText('訂單已更新')).toBeInTheDocument()

    await act(async () => { vi.advanceTimersByTime(3600) })

    expect(screen.queryByText('訂單已更新')).not.toBeInTheDocument()
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

    expect(screen.getByRole('alert')).toHaveTextContent('目前其他住戶已訂 56 個，成團上限為 63 個，本次最多可訂 7 個。')
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
    const resident = { ...initialOrders[0], householdKind: 'resident' as const }
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
    expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('7 個')).toBeInTheDocument()
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
    expect(screen.getByRole('group', { name: '戶號' })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: '戶號數字' }), '3')
    await user.selectOptions(screen.getByRole('combobox', { name: '戶號英文字母' }), 'Z')
    await user.selectOptions(screen.getByRole('combobox', { name: '樓層' }), '15')
    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))

    expect(onBindResident).toHaveBeenCalledWith({ kind: 'resident', period: 3, unit: '3Z15' })
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
    expect(screen.queryByRole('combobox', { name: '戶號數字' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: '戶號英文字母' }), 'Z')
    await user.selectOptions(screen.getByRole('combobox', { name: '樓層' }), '15')
    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))

    expect(onBindResident).toHaveBeenCalledWith({ kind: 'resident', period: 1, unit: 'Z15' })
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

  it('shows a safe known message from a Supabase resident binding error object', async () => {
    const user = userEvent.setup()
    render(
      <App
        visibleOrders={[]}
        residentCustomer={null}
        verifiedResidentIdentity={{ displayName: '富美', pictureUrl: null }}
        onBindResident={vi.fn().mockRejectedValue({
          code: '23505',
          message: '此期別與戶號已由其他住戶綁定',
          details: 'sensitive database detail',
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('此期別與戶號已由其他住戶綁定')
    expect(alert).not.toHaveTextContent('sensitive database detail')
  })

  it('explains that one household can use several LINE accounts', () => {
    render(
      <App
        visibleOrders={[]}
        residentCustomer={null}
        verifiedResidentIdentity={{ displayName: '富美', pictureUrl: null }}
      />,
    )

    expect(screen.getByText('住戶資料只用於辨識訂單；同一戶號可由多個LINE帳號各自下單。')).toBeInTheDocument()
    expect(screen.queryByText(/只能綁定一個帳號/)).not.toBeInTheDocument()
  })

  it('shows a closed campaign and disables every order control', () => {
    render(<App campaignStatus="closed" />)

    expect(screen.getByText('已結單')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '送出訂單' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '增加 A 牛奶（招牌）' })).toBeDisabled()
    expect(screen.getByText('本團已結單，無法修改訂單。')).toBeInTheDocument()
  })

  it('shows item names and prices without 號 and uses plus signs on the live wall', async () => {
    const user = userEvent.setup()
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
    const resident = { ...initialOrders[0], householdKind: 'resident' as const }
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

    const productSelection = screen.getByRole('region', { name: '商品選擇' })
    expect(within(productSelection).getByText('牛奶')).toBeInTheDocument()
    expect(within(productSelection).getByText('$45')).toBeInTheDocument()
    expect(within(productSelection).getByText('草莓')).toBeInTheDocument()
    expect(within(productSelection).getByText('$60')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '查看訂單明細' }))
    expect(within(screen.getByRole('dialog', { name: '訂單明細' })).getByText('$150')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '關閉訂單明細' }))
    expect(screen.getByText('A+2、B+1')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '大家的訂單' })).queryByText('三期 3Z15')).not.toBeInTheDocument()
    expect(screen.queryByText(/A號|B號/)).not.toBeInTheDocument()
  })

  it('shows campaign and order timestamps with meaningful edit markers', () => {
    render(<App />)

    expect(screen.getByText('已有 6 筆訂單・開團 2026/08/14 08:05')).toBeInTheDocument()
    const wall = screen.getByRole('region', { name: '大家的訂單' })
    expect(within(wall).getByText('08/14 08:10')).toBeInTheDocument()
    expect(within(wall).getByText('已修改')).toHaveAttribute('title', '最後修改 2026/08/14 08:12')
  })

  it('preserves an unsent draft when another household updates through Realtime', async () => {
    const user = userEvent.setup()
    const resident = { ...initialOrders[0], householdKind: 'resident' as const }
    const onSubmitOrder = async () => undefined
    const view = render(
      <App visibleOrders={initialOrders} residentCustomer={resident} onSubmitOrder={onSubmitOrder} />,
    )

    await user.click(screen.getByRole('button', { name: '增加 A 牛奶（招牌）' }))
    expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('7 個')).toBeInTheDocument()

    view.rerender(
      <App
        visibleOrders={initialOrders.map((order, index) => index === 1
          ? { ...order, updatedAt: '2026-08-14T01:30:00Z' }
          : order)}
        residentCustomer={resident}
        onSubmitOrder={onSubmitOrder}
      />,
    )
    expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('7 個')).toBeInTheDocument()
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

  it('points residents to the organizer when every quantity is cleared', async () => {
    const user = userEvent.setup()
    const resident = { ...initialOrders[0], items: { A: 1 }, householdKind: 'resident' as const }
    render(<App residentCustomer={resident} visibleOrders={[resident]} />)

    expect(screen.queryByText('想整筆取消訂單，請聯繫團主協助取消。')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '減少 A 牛奶（招牌）' }))

    expect(screen.getByRole('button', { name: '送出訂單' })).toBeDisabled()
    expect(screen.getByText('想整筆取消訂單，請聯繫團主協助取消。')).toBeInTheDocument()
  })

  it('hides the cancel hint from residents who have no order yet', () => {
    const resident = { ...initialOrders[0], items: {}, householdKind: 'resident' as const }
    render(<App residentCustomer={resident} visibleOrders={[]} />)

    expect(screen.getByRole('button', { name: '送出訂單' })).toBeDisabled()
    expect(screen.queryByText('想整筆取消訂單，請聯繫團主協助取消。')).not.toBeInTheDocument()
  })

  it('lets someone outside the community bind without a household', async () => {
    const user = userEvent.setup()
    const onBindResident = vi.fn().mockResolvedValue(undefined)
    render(<App residentCustomer={null} onBindResident={onBindResident} />)

    await user.selectOptions(screen.getByRole('combobox', { name: '期別' }), '其他')

    expect(screen.queryByRole('combobox', { name: '戶號英文字母' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '樓層' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))

    expect(onBindResident).toHaveBeenCalledWith({ kind: 'other', period: null, unit: null })
  })

  it('brings the household selects back when someone changes their mind after picking 其他', async () => {
    const user = userEvent.setup()
    render(<App residentCustomer={null} onBindResident={vi.fn().mockResolvedValue(undefined)} />)

    await user.selectOptions(screen.getByRole('combobox', { name: '期別' }), '其他')
    expect(screen.queryByRole('combobox', { name: '戶號數字' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '戶號英文字母' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '樓層' })).not.toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: '期別' }), '二期')

    expect(screen.getByRole('combobox', { name: '戶號數字' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '戶號英文字母' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '樓層' })).toBeInTheDocument()
  })

  it('still requires a unit from someone who says they live here', async () => {
    const user = userEvent.setup()
    const onBindResident = vi.fn().mockResolvedValue(undefined)
    render(<App residentCustomer={null} onBindResident={onBindResident} />)

    await user.selectOptions(screen.getByRole('combobox', { name: '期別' }), '一期')
    await user.selectOptions(screen.getByRole('combobox', { name: '戶號英文字母' }), 'H')
    await user.selectOptions(screen.getByRole('combobox', { name: '樓層' }), '11')
    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))

    expect(onBindResident).toHaveBeenCalledWith({ kind: 'resident', period: 1, unit: 'H11' })
  })

  it('gives every demo order its own identity so one household can hold two of them', () => {
    const ids = initialOrders.map((order) => order.customerId)

    expect(new Set(ids).size).toBe(ids.length)
    expect(initialOrders.every((order) => order.householdKind === 'resident')).toBe(true)
  })

  it('shows the published arrival and optional automatic closing reminder', () => {
    // Pin the clock: on 2027-10-14/15 the relative 今天／明天 wording would
    // replace the date this test expects.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-20T00:00:00.000Z'))
    render(<App visibleOrders={[]} publishedContent={{
      title: '時程測試團', unitPrice: 50, threshold: 10,
      announcement: '', images: [],
      items: [{ code: 'A', name: '商品', unitPrice: 50, active: true }],
      openedAt: '2026-09-20T00:00:00.000Z',
      arrivalLabel: '10月中',
      autoCloseAt: '2027-10-15T04:00:00.000Z',
    }} />)

    expect(screen.getByText('預計到貨')).toBeInTheDocument()
    expect(screen.getByText('10月中')).toBeInTheDocument()
    expect(screen.getByText('10/15（五）12:00')).toBeInTheDocument()
  })

  it('labels the scheduled closing time as 原訂結單 once a campaign is no longer open', () => {
    render(<App visibleOrders={[]} campaignStatus="closed" publishedContent={{
      title: '已結單測試團', unitPrice: 50, threshold: 10,
      announcement: '', images: [],
      items: [{ code: 'A', name: '商品', unitPrice: 50, active: true }],
      openedAt: '2026-09-20T00:00:00.000Z',
      arrivalLabel: '10月中',
      autoCloseAt: '2027-10-15T04:00:00.000Z',
    }} />)

    expect(screen.getByText('已結單', { selector: '.ui-status-badge' })).toBeInTheDocument()
    expect(screen.getByText('原訂結單')).toBeInTheDocument()
    expect(screen.queryByText('結單')).not.toBeInTheDocument()
    expect(screen.getByText('10/15（五）12:00')).toBeInTheDocument()
  })

  it('tells residents what they have already submitted and why submit is disabled', () => {
    render(<App />)

    expect(screen.getByText('你已送出 6 個・$270')).toBeInTheDocument()
    expect(screen.getByText('・最後修改 2026/08/14 08:12')).toBeInTheDocument()
    expect(screen.getByText('結單前都可以回來改數量；要整筆取消請找團主。')).toBeInTheDocument()
  })

  it('explains that items must be chosen before a first order', () => {
    const resident = { ...initialOrders[0], items: {}, householdKind: 'resident' as const }
    render(<App residentCustomer={resident} visibleOrders={[]} />)

    expect(screen.queryByText(/你已送出/)).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('訂單摘要與送出')).getByText('選擇品項後即可送出。')).toBeInTheDocument()
  })
})
