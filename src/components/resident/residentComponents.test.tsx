import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CampaignSummary } from './CampaignSummary'
import { CampaignInfo } from './CampaignInfo'
import { OrderBreakdown } from './OrderBreakdown'
import { OrderSummaryBar } from './OrderSummaryBar'
import { OrderWall } from './OrderWall'
import { ProductRow } from './ProductRow'
import { ResidentBindingForm } from './ResidentBindingForm'
import type { VisibleOrder } from '../../data/demo'

const progress = { value: 62, max: 100, text: '62 個 / 100 個', remainingText: '還差 38 個成團', formed: false }

describe('resident campaign page parts', () => {
  it('summarises status, price, schedule and progress', () => {
    const { rerender } = render(
      <CampaignSummary title="冰餅團" status="open" priceText="$45／個"
        schedule={{ closing: { value: '10/15 12:00', line: '10/15 12:00 結單', soon: false, note: '額滿會提早結單' }, arrival: { value: '10月中', line: '10月中到貨' } }}
        progress={progress} orderCount={6} openedAt="2026-08-14T00:05:09.000Z" />,
    )

    expect(screen.getByRole('heading', { level: 1, name: '冰餅團' })).toBeInTheDocument()
    expect(screen.getByText('開團中')).toBeInTheDocument()
    expect(screen.getByText('$45／個')).toBeInTheDocument()
    const schedule = screen.getByRole('group', { name: '團購時程' })
    expect(within(schedule).getByText('預計到貨')).toBeInTheDocument()
    expect(within(schedule).getByText('10月中')).toBeInTheDocument()
    expect(within(schedule).getByText('結單')).toBeInTheDocument()
    expect(within(schedule).getByText('10/15 12:00')).toBeInTheDocument()
    expect(within(schedule).getByText('額滿會提早結單')).toBeInTheDocument()
    // Same order as the list card's tags: closing first, then arrival.
    expect([...schedule.querySelectorAll('dt')].map((term) => term.textContent)).toEqual(['結單', '預計到貨'])
    expect(screen.getByRole('heading', { level: 2, name: '成團進度' })).toBeInTheDocument()
    expect(screen.getByText('還差 38 個成團')).not.toHaveClass('is-formed')
    expect(document.querySelector('.resident-summary-meta')).toHaveTextContent('6 筆訂單・8/14 開團')

    rerender(
      <CampaignSummary title="冰餅團" status="closed" priceText="$45／個"
        schedule={{ closing: null, arrival: { value: '貨到通知', line: '貨到通知' } }}
        progress={{ ...progress, remainingText: '已成團', formed: true }} orderCount={6} openedAt={null} />,
    )
    const closedSchedule = screen.getByRole('group', { name: '團購時程' })
    expect(within(closedSchedule).getByText('已結單')).toBeInTheDocument()
    expect(within(closedSchedule).getByText('貨到通知')).toBeInTheDocument()
    expect(screen.queryByText(/未排定|原訂/)).not.toBeInTheDocument()
    expect(screen.getByText('已成團')).toHaveClass('is-formed')
    expect(document.querySelector('.resident-summary-meta')).toHaveTextContent(/^6 筆訂單$/)
  })

  it('collapses only long announcements', async () => {
    const user = userEvent.setup()
    const longText = Array.from({ length: 12 }, (_, index) => `第 ${index + 1} 行`).join('\n')
    const { rerender } = render(<CampaignInfo images={[]} announcement={longText} onOpenImage={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '開團資訊' })).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: '展開全文' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: '收合' })).toHaveAttribute('aria-expanded', 'true')

    rerender(<CampaignInfo images={[]} announcement="短公告" onOpenImage={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /展開全文|收合/ })).not.toBeInTheDocument()

    rerender(<CampaignInfo images={[]} announcement="  " onOpenImage={vi.fn()} />)
    expect(screen.queryByRole('heading', { name: '開團資訊' })).not.toBeInTheDocument()
  })

  it('expands a collapsed announcement when focus lands on a link hidden inside it', async () => {
    const user = userEvent.setup()
    const longAnnouncement = `${'公告內容。'.repeat(90)}\nhttps://example.com/detail`
    render(<CampaignInfo images={[]} announcement={longAnnouncement} onOpenImage={vi.fn()} />)

    expect(screen.getByRole('button', { name: '展開全文' })).toHaveAttribute('aria-expanded', 'false')

    await user.tab()

    expect(screen.getByRole('link', { name: 'https://example.com/detail' })).toHaveFocus()
    expect(screen.getByRole('button', { name: '收合' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('lists priced lines, custom items and savings in the breakdown', () => {
    render(
      <OrderBreakdown
        quantityUnit="個"
        total={706}
        savings={113}
        customItems={[{ id: 'custom-1', name: '限定蛋糕', quantity: 2 }]}
        lines={[{
          code: 'A', label: 'A', name: '五花肉片', discountText: '任選三件85折', quantity: 2, listUnitPrice: 170,
          discountRate: 0.85, discountType: 'mix_match', promotionName: '任選三件85折', finalUnitPrice: 145, lineTotal: 290,
        }]}
      />,
    )

    expect(screen.getByText('五花肉片')).toBeInTheDocument()
    expect(screen.getByText('2 × $145')).toBeInTheDocument()
    expect(screen.getByText('$290')).toBeInTheDocument()
    expect(screen.getByText('限定蛋糕')).toBeInTheDocument()
    expect(screen.getByText('金額另計')).toBeInTheDocument()
    expect(screen.getByText('$706')).toBeInTheDocument()
    expect(screen.getByText('已省 $113')).toBeInTheDocument()
  })

  it('keeps the order total, breakdown and submit together with the reason it is disabled', async () => {
    const user = userEvent.setup()
    const showBreakdown = vi.fn()
    render(
      <OrderSummaryBar quantity={6} quantityUnit="個" amount={270} customQuantity={2} onShowBreakdown={showBreakdown}
        submitDisabled submitting={false} onSubmit={vi.fn()} hint="選擇品項後即可送出。" />,
    )

    const bar = screen.getByRole('region', { name: '訂單摘要與送出' })
    expect(within(bar).getByText('6 個')).toBeInTheDocument()
    expect(within(bar).getByText('$270')).toBeInTheDocument()
    expect(within(bar).getByText('另有 2 個額外品項・金額另計')).toBeInTheDocument()
    expect(within(bar).getByText('選擇品項後即可送出。')).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: '送出訂單' })).toBeDisabled()
    await user.click(within(bar).getByRole('button', { name: '查看訂單明細' }))
    expect(showBreakdown).toHaveBeenCalledOnce()
  })

  it('offers a shortcut to the items instead of a disabled submit while nothing is chosen', async () => {
    const user = userEvent.setup()
    const chooseItems = vi.fn()
    render(
      <OrderSummaryBar quantity={0} quantityUnit="個" amount={0} customQuantity={0}
        submitDisabled submitting={false} onSubmit={vi.fn()} onChooseItems={chooseItems} hint="選擇品項後即可送出。" />,
    )

    const bar = screen.getByRole('region', { name: '訂單摘要與送出' })
    expect(within(bar).queryByRole('button', { name: '送出訂單' })).not.toBeInTheDocument()
    await user.click(within(bar).getByRole('button', { name: '選擇品項' }))
    expect(chooseItems).toHaveBeenCalledOnce()
  })

  it('marks a product row once it has a quantity', () => {
    const { rerender } = render(
      <ProductRow code="A" name="牛奶" priceText="$45" quantity={0} disabled={false} onDecrement={vi.fn()} onIncrement={vi.fn()} />,
    )
    const row = screen.getByText('牛奶').closest('.resident-product-row')!
    expect(row).not.toHaveAttribute('data-selected')
    rerender(<ProductRow code="A" name="牛奶" priceText="$45" quantity={2} disabled={false} onDecrement={vi.fn()} onIncrement={vi.fn()} />)
    expect(row).toHaveAttribute('data-selected', 'true')
  })

  it('lists each order’s items in the campaign’s item order, not the order they were tapped', () => {
    const order: VisibleOrder = {
      customerId: 'a', name: '阿宅', period: 2, unit: '2A1', householdKind: 'resident',
      // Insertion order mirrors tapping E before A, and a code the campaign lists before A.
      items: { E: 1, A: 2, ITEM0: 1 },
      orderedAt: '2026-08-14T00:00:00Z', updatedAt: '2026-08-14T00:00:00Z',
    }
    const codes = ['ITEM0', 'A', 'B', 'E']
    render(<OrderWall orders={[order]} quantityUnit="包" itemCodes={codes} itemDisplayLabel={(code) => code === 'ITEM0' ? '甲' : code} />)
    expect(screen.getByText('甲+1、A+2、E+1')).toBeInTheDocument()
  })

  it('colours letter avatars by name so the same person always gets the same colour', () => {
    const order = (customerId: string, name: string): VisibleOrder => ({
      customerId, name, period: 2, unit: '2A1', householdKind: 'resident', items: { A: 1 },
      orderedAt: '2026-08-14T00:00:00Z', updatedAt: '2026-08-14T00:00:00Z',
    })
    const orders = [order('a', '陳小姐'), order('b', 'Kevin'), order('c', '陳小姐'), order('d', '林媽媽'), order('e', 'Amy'), order('f', '王大明')]
    render(<OrderWall orders={orders} quantityUnit="個" itemDisplayLabel={(code) => code} />)

    const tones = screen.getAllByRole('listitem').map((item) => item.querySelector('.resident-avatar')!.getAttribute('data-tone'))
    tones.forEach((tone) => expect(tone).toMatch(/^[1-6]$/))
    expect(tones[0]).toBe(tones[2])
    expect(new Set(tones).size).toBeGreaterThan(1)
  })

  it('shows reaching the threshold in the summary', () => {
    render(<CampaignSummary title="冰餅團" status="open" priceText="$45" schedule={{ closing: { value: '額滿自動結單', line: '額滿結單', soon: false }, arrival: { value: '貨到通知', line: '貨到通知' } }} orderCount={10} openedAt={null}
      progress={{ value: 100, max: 100, text: '100 個 / 100 個', remainingText: '已成團', formed: true }} />)
    expect(screen.getByRole('progressbar', { name: '成團進度' })).toHaveAttribute('data-formed', 'true')
  })

  it('shows the order wall without households, marks the resident and caps the first view at twenty', async () => {
    const user = userEvent.setup()
    const orders: VisibleOrder[] = Array.from({ length: 23 }, (_, index) => ({
      customerId: `customer-${index}`,
      name: `住戶${index + 1}`,
      period: 2,
      unit: `2A${index + 1}`,
      householdKind: 'resident',
      items: { A: 1 },
      orderedAt: new Date(Date.UTC(2026, 7, 14, 0, index)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 7, 14, 0, index)).toISOString(),
    }))
    render(<OrderWall orders={orders} currentCustomerId="customer-0" quantityUnit="個" itemDisplayLabel={(code) => code} />)

    const wall = screen.getByRole('region', { name: '大家的訂單' })
    expect(within(wall).getByText('23 筆・即時更新')).toBeInTheDocument()
    expect(within(wall).getAllByRole('listitem')).toHaveLength(20)
    expect(within(wall).getByText('（你）')).toBeInTheDocument()
    expect(within(wall).queryByText(/2A1/)).not.toBeInTheDocument()
    await user.click(within(wall).getByRole('button', { name: '顯示全部 23 筆' }))
    expect(within(wall).getAllByRole('listitem')).toHaveLength(23)
  })

  it('shows how long ago each order was placed and changed on the order wall', () => {
    const now = new Date('2026-09-25T04:00:00.000Z')
    const wall = [
      { customerId: 'c1', name: '住戶甲', items: { A: 1 }, orderedAt: '2026-09-25T03:55:00.000Z', updatedAt: '2026-09-25T03:59:30.000Z' },
      { customerId: 'c2', name: '住戶乙', items: { A: 2 }, orderedAt: '2026-09-25T01:00:00.000Z', updatedAt: '2026-09-25T01:00:00.000Z' },
    ]
    render(<OrderWall orders={wall as never} quantityUnit="個" itemDisplayLabel={(code) => code} now={now} />)

    const placed = screen.getByText('5 分鐘前')
    expect(placed.tagName).toBe('TIME')
    expect(placed).toHaveAttribute('title', '2026/09/25 11:55')
    expect(screen.getByText('已修改')).toHaveAttribute('title', '最後修改 2026/09/25 11:59')
    expect(placed.closest('.resident-wall-time')).toHaveTextContent('5 分鐘前·已修改')
    expect(screen.queryByText('剛剛')).not.toBeInTheDocument()
    expect(screen.getByText('3 小時前')).toBeInTheDocument()
    expect(screen.getAllByText(/已修改/)).toHaveLength(1)
    expect(screen.queryByText(/下單/)).not.toBeInTheDocument()
  })

  it('binds someone outside the community and shows a safe binding error', async () => {
    const user = userEvent.setup()
    const onBind = vi.fn()
      .mockRejectedValueOnce({ code: '23505', message: '此期別與戶號已由其他住戶綁定', details: 'sensitive database detail' })
      .mockResolvedValueOnce(undefined)
    render(<ResidentBindingForm identity={{ displayName: '富美', pictureUrl: null }} disabled={false} onBind={onBind} />)

    expect(screen.getByRole('heading', { name: '首次填寫住戶資料' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('此期別與戶號已由其他住戶綁定')
    expect(screen.getByRole('alert')).not.toHaveTextContent('sensitive database detail')

    await user.selectOptions(screen.getByRole('combobox', { name: '期別' }), '其他')
    expect(screen.queryByRole('combobox', { name: '樓層' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '儲存住戶資料' }))
    expect(onBind).toHaveBeenLastCalledWith({ kind: 'other', period: null, unit: null })
  })
})

describe('ProductRow', () => {
  it('renders the code, name, price, list price and hint when given', () => {
    render(
      <ProductRow code="A" name="五花肉片" priceText="$45／個" listPrice={60} hint="限量20份"
        quantity={3} disabled={false} onDecrement={vi.fn()} onIncrement={vi.fn()} />,
    )

    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('五花肉片')).toBeInTheDocument()
    expect(screen.getByText('$45／個')).toBeInTheDocument()
    expect(screen.getByText('原價 $60')).toBeInTheDocument()
    expect(screen.getByText('限量20份')).toBeInTheDocument()
  })

  it('omits the list price and hint when not given', () => {
    render(
      <ProductRow code="B" name="花生糖" priceText="$30／個"
        quantity={0} disabled={false} onDecrement={vi.fn()} onIncrement={vi.fn()} />,
    )

    expect(screen.queryByText(/原價/)).not.toBeInTheDocument()
    expect(screen.queryByText('限量20份')).not.toBeInTheDocument()
  })

  it('wires the quantity control to onDecrement and onIncrement', async () => {
    const user = userEvent.setup()
    const onDecrement = vi.fn()
    const onIncrement = vi.fn()
    render(
      <ProductRow code="A" name="五花肉片" priceText="$45／個" quantity={2} disabled={false}
        onDecrement={onDecrement} onIncrement={onIncrement} />,
    )

    await user.click(screen.getByRole('button', { name: '減少 A 五花肉片' }))
    expect(onDecrement).toHaveBeenCalledOnce()
    expect(onIncrement).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '增加 A 五花肉片' }))
    expect(onIncrement).toHaveBeenCalledOnce()
  })

  it('disables the quantity control so no callback fires', async () => {
    const user = userEvent.setup()
    const onDecrement = vi.fn()
    const onIncrement = vi.fn()
    render(
      <ProductRow code="A" name="五花肉片" priceText="$45／個" quantity={2} disabled
        onDecrement={onDecrement} onIncrement={onIncrement} />,
    )

    const decrementButton = screen.getByRole('button', { name: '減少 A 五花肉片' })
    const incrementButton = screen.getByRole('button', { name: '增加 A 五花肉片' })
    expect(decrementButton).toBeDisabled()
    expect(incrementButton).toBeDisabled()

    await user.click(decrementButton)
    await user.click(incrementButton)
    expect(onDecrement).not.toHaveBeenCalled()
    expect(onIncrement).not.toHaveBeenCalled()
  })
})
