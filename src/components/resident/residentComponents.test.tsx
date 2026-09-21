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
      <CampaignSummary title="冰餅團" status="open" priceText="$45／個" arrivalLabel="10月中"
        closingText="10/15（五）12:00" progress={progress} orderCount={6} openedAt="2026-08-14T00:05:09.000Z" />,
    )

    expect(screen.getByRole('heading', { level: 1, name: '冰餅團' })).toBeInTheDocument()
    expect(screen.getByText('開團中')).toBeInTheDocument()
    expect(screen.getByText('$45／個')).toBeInTheDocument()
    expect(screen.getByText('10月中')).toBeInTheDocument()
    expect(screen.getByText('10/15（五）12:00')).toBeInTheDocument()
    expect(screen.getByText('還差 38 個成團')).not.toHaveClass('is-formed')
    expect(screen.getByText('已有 6 筆訂單・開團 2026/08/14 08:05')).toBeInTheDocument()

    rerender(
      <CampaignSummary title="冰餅團" status="closed" priceText="$45／個" closingText={null}
        progress={{ ...progress, remainingText: '已成團', formed: true }} orderCount={6} openedAt={null} />,
    )
    expect(screen.getByText('已結單')).toBeInTheDocument()
    expect(screen.getByText('貨到通知')).toBeInTheDocument()
    expect(screen.queryByText('結單')).not.toBeInTheDocument()
    expect(screen.getByText('已成團')).toHaveClass('is-formed')
    expect(screen.getByText('已有 6 筆訂單')).toBeInTheDocument()
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
