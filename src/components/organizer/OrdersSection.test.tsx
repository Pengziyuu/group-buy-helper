import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { initialOrders, items } from '../../data/demo'
import { buildOrganizerOrderSummary, type OrganizerOrderSummary } from '../../domain/adminOrders'
import { OrdersSection } from './OrdersSection'


const base = buildOrganizerOrderSummary({ orders: initialOrders, items, threshold: 100 })
const summary: OrganizerOrderSummary = {
  ...base,
  orderRows: base.orderRows.map((order, index) => ({
    ...order,
    orderId: `order-${index + 1}`,
    organizerNote: index === 0 ? '請放管理室' : '',
    orderedAt: `2026-09-24T1${index}:00:00.000Z`,
  })),
}

function renderOrders(props: Partial<Parameters<typeof OrdersSection>[0]> = {}) {
  return render(
    <OrdersSection
      campaignTitle="一涼製冰所"
      openedAt="2026-09-20T00:00:00.000Z"
      summary={summary}
      status="open"
      liveState="live"
      {...props}
    />,
  )
}

const rowOf = (name: RegExp) => screen.getByRole('rowheader', { name }).closest('tr') as HTMLElement

describe('OrdersSection', () => {
  it('shows the totals and each order with item tags, without any payment controls', () => {
    renderOrders()

    expect(screen.getByRole('heading', { level: 2, name: '訂單' })).toBeInTheDocument()
    const totals = screen.getByLabelText('訂單總覽')
    expect(within(totals).getByText('6 筆')).toBeInTheDocument()
    expect(within(totals).getByText('$2,790')).toBeInTheDocument()
    // A quantity threshold already shows the total quantity in the progress line; no second copy.
    expect(within(totals).queryByText('總數量')).not.toBeInTheDocument()
    const row = rowOf(/2K13\s*斯祈/)
    expect(within(row).getByText('B+2')).toHaveAttribute('title', '花生（招牌）')
    expect(within(row).getByText('D+2')).toBeInTheDocument()
    expect(within(row).getByText('6 個')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '付款' })).not.toBeInTheDocument()
    expect(screen.queryByText(/已付款|未付款/)).not.toBeInTheDocument()
  })

  it('combines the unique overview details with orders, without a second latest-orders list', () => {
    renderOrders({ campaignId: 'campaign-1', now: new Date('2026-09-25T04:00:00.000Z') })
    expect(screen.getByText('62 / 100 個')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '成團進度' })).toHaveAttribute('aria-valuenow', '62')
    expect(screen.getByText('還差 38 個成團')).toBeInTheDocument()
    expect(within(screen.getByLabelText('訂單總覽')).getByText('今天')).toBeInTheDocument()
    // Folded by default, with the count and total in the summary line, so the order list stays near the top.
    const folded = screen.getByText('品項數量', { selector: 'summary' }).closest('details') as HTMLElement
    expect(folded).not.toHaveAttribute('open')
    expect(folded.querySelector('summary')).toHaveTextContent('品項數量 9 項・合計 62 個')
    // Opened: one aligned line per item (code, name, quantity), so it can be screenshotted for the supplier.
    const items = within(folded).getByRole('list', { name: '品項數量', hidden: true })
    expect(within(items).getAllByRole('listitem', { hidden: true }).map((line) => line.textContent)).toContain('B花生（招牌）14 個')
    expect(screen.queryByRole('list', { name: '最新訂單' })).not.toBeInTheDocument()
  })

  it('says a formed campaign is formed and by how much, instead of a fraction past its threshold', () => {
    const formed = buildOrganizerOrderSummary({ orders: initialOrders, items, threshold: 14 })
    renderOrders({ summary: formed })
    const progress = screen.getByLabelText('成團進度摘要')
    expect(progress).toHaveTextContent('已成團')
    expect(progress).toHaveTextContent('62 個')
    expect(progress).toHaveTextContent('門檻 14 個・超過 48 個')
    expect(screen.queryByText('62 / 14 個')).not.toBeInTheDocument()
  })

  it('copies the item quantities as plain lines for the supplier, leaving out items nobody ordered', async () => {
    const user = userEvent.setup()
    renderOrders()
    await user.click(screen.getByRole('button', { name: '複製品項數量' }))
    const copied = await navigator.clipboard.readText()
    expect(copied.split('\n')).toEqual([
      '一涼製冰所',
      ...summary.itemRows.filter((item) => item.quantity > 0).map((item) => `${item.name} ${item.quantity} 個`),
      '合計 62 個',
    ])
    expect(await screen.findByText('已複製')).toBeInTheDocument()
  })

  it('tallies custom items with the formal ones and copies them for the supplier', async () => {
    const user = userEvent.setup()
    const withCustom = buildOrganizerOrderSummary({
      orders: initialOrders.map((order, index) => index < 2
        ? { ...order, customItems: [{ id: `custom-${index}`, name: index === 0 ? '提袋' : ' 提袋 ', quantity: 2 }] }
        : order),
      items,
      threshold: 100,
    })
    renderOrders({ summary: withCustom })

    const folded = screen.getByText('品項數量', { selector: 'summary' }).closest('details') as HTMLElement
    expect(folded.querySelector('summary')).toHaveTextContent('品項數量 10 項・合計 66 個')
    const lines = within(within(folded).getByRole('list', { name: '品項數量', hidden: true })).getAllByRole('listitem', { hidden: true })
    expect(lines.at(-1)).toHaveTextContent('額外提袋4 個')

    await user.click(screen.getByRole('button', { name: '複製品項數量' }))
    const copied = (await navigator.clipboard.readText()).split('\n')
    expect(copied.slice(-2)).toEqual(['提袋（額外品項） 4 個', '合計 66 個'])
  })

  it('shows discounted amount-threshold progress and retains the closed-campaign pickup shortcut', () => {
    const amountSummary = buildOrganizerOrderSummary({ orders: initialOrders, items, threshold: 100, thresholdKind: 'amount', amountThreshold: 5000 })
    renderOrders({ campaignId: 'campaign-1', summary: amountSummary, status: 'closed' })
    expect(screen.getByText('$2,790 / $5,000')).toBeInTheDocument()
    expect(screen.getByText('還差 $2,210 成團')).toBeInTheDocument()
    // An amount threshold does not show the quantity anywhere else, so the totals keep it.
    expect(within(screen.getByLabelText('訂單總覽')).getByText('62 個')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '領取通知' })).toHaveAttribute('href', '/admin/campaign/campaign-1/pickup')
  })

  it('preserves a marker for orders updated since the previous visit', () => {
    const key = 'group-buy-helper:organizer-last-seen:campaign-1'
    window.localStorage.setItem(key, '2026-09-25T03:30:00.000Z')
    const updated: OrganizerOrderSummary = {
      ...summary,
      orderRows: summary.orderRows.map((row, index) => index === 0 ? { ...row, updatedAt: '2026-09-25T03:57:00.000Z' } : row),
    }
    try {
      renderOrders({ campaignId: 'campaign-1', summary: updated })
      expect(screen.getAllByText('上次查看後有更新')).toHaveLength(1)
      // A short visible 新, with the full meaning kept for screen readers.
      expect(screen.getByText('上次查看後有更新').closest('.organizer-new-badge')).toHaveTextContent(/^新上次查看後有更新$/)
      expect(screen.getByText(/共 6 筆/).closest('p')).toHaveTextContent('共 6 筆・1 筆上次查看後有更新')
      expect(window.localStorage.getItem(key)).not.toBe('2026-09-25T03:30:00.000Z')
    } finally {
      window.localStorage.removeItem(key)
    }
  })

  it('shows each resident’s LINE picture, or a coloured initial without one', () => {
    const withPictures: OrganizerOrderSummary = {
      ...summary,
      orderRows: summary.orderRows.map((order) => ({ ...order, pictureUrl: order.name === '斯祈' ? 'https://profile.line-scdn.net/abc' : null })),
    }
    renderOrders({ summary: withPictures })

    const pictured = rowOf(/2K13\s*斯祈/)
    expect(within(pictured).getByRole('img', { name: '斯祈的 LINE 頭貼' })).toHaveAttribute('src', 'https://profile.line-scdn.net/abc')
    const initial = rowOf(/H11\s*佩怡/).querySelector('.ui-avatar')
    expect(initial).toHaveTextContent('佩')
    expect(initial).toHaveAttribute('data-tone', expect.stringMatching(/^[1-6]$/))
  })

  it('uses the campaign quantity unit and marks extra items as priced separately', () => {
    const boxSummary = buildOrganizerOrderSummary({
      orders: initialOrders.map((order, index) => index === 0
        ? { ...order, customItems: [{ id: 'custom-1', name: '限定蛋糕', quantity: 2 }] }
        : order),
      items,
      threshold: 100,
      quantityUnit: '盒',
    })
    renderOrders({ summary: boxSummary })

    // The custom item counts toward the progress.
    expect(screen.getByLabelText('成團進度摘要')).toHaveTextContent('64 / 100 盒')
    // customItems was attached to initialOrders[0] (斯祈・2K13), not H11 — the household
    // sort puts H11 first on screen, but the custom item belongs to the 2K13 row.
    const row = rowOf(/2K13\s*斯祈/)
    expect(within(row).getByText('限定蛋糕+2・另計')).toBeInTheDocument()
    expect(within(row).getByText('＋另計')).toBeInTheDocument()
  })

  it('offers export only once the campaign closes', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderOrders({ onExport })
    expect(screen.queryByRole('button', { name: '匯出 Excel' })).not.toBeInTheDocument()
    expect(screen.queryByText('結單後才能匯出')).not.toBeInTheDocument()

    rerender(<OrdersSection campaignTitle="一涼製冰所" openedAt="2026-09-20T00:00:00.000Z" summary={summary} status="closed" liveState="live" onExport={onExport} />)
    await user.click(screen.getByRole('button', { name: '匯出 Excel' }))
    expect(onExport).toHaveBeenCalledOnce()
  })

  it('starts with the newest orders while open and by household once closed, and searches by name or household', async () => {
    const user = userEvent.setup()
    const { unmount } = renderOrders({ status: 'closed' })
    const names = () => screen.getAllByRole('rowheader').map((cell) => cell.textContent)
    // Closed: sorting and handing out goes by household.
    expect(names()[0]).toMatch(/H11/)
    unmount()

    renderOrders()
    // Open: newest first, so orders marked 新 sit at the top.
    expect(names()[0]).toMatch(/Lena/)
    await user.click(screen.getByRole('radio', { name: '戶號' }))
    expect(names()[0]).toMatch(/H11/)
    expect(screen.getByText('共 6 筆')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: '搜尋訂單' }), '2k13')
    expect(names()).toHaveLength(1)
    expect(names()[0]).toMatch(/斯祈/)

    await user.clear(screen.getByRole('searchbox', { name: '搜尋訂單' }))
    await user.type(screen.getByRole('searchbox', { name: '搜尋訂單' }), '不存在的人')
    expect(screen.getByText('沒有符合的訂單。')).toBeInTheDocument()
  })

  it('edits an organizer note in place and saves with Enter', async () => {
    const user = userEvent.setup()
    const onSetOrderOrganizerNote = vi.fn().mockResolvedValue(undefined)
    renderOrders({ onSetOrderOrganizerNote })

    const edit = screen.getByRole('button', { name: '編輯 H11 備註' })
    expect(edit).toHaveTextContent('請放管理室')
    // Both states read as clickable without hovering: a saved note carries a pencil, an empty one is a blue ＋ 新增備註.
    expect(edit.querySelector('svg.organizer-note-icon')).toBeInTheDocument()
    const empty = screen.getByRole('button', { name: '編輯 1E7 備註' })
    expect(empty).toHaveTextContent('＋新增備註')
    expect(empty).toHaveAttribute('data-empty')
    await user.click(edit)
    const input = screen.getByRole('textbox', { name: 'H11 備註' })
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute('maxLength', '500')
    await user.clear(input)
    await user.type(input, '改放警衛室{Enter}')

    expect(onSetOrderOrganizerNote).toHaveBeenCalledWith('order-1', '改放警衛室')
    const saved = await screen.findByRole('button', { name: '編輯 H11 備註' })
    expect(saved).toHaveTextContent('改放警衛室')
    expect(saved).toHaveFocus()
  })

  it('cancels a note edit with Escape and saves on leaving the field', async () => {
    const user = userEvent.setup()
    const onSetOrderOrganizerNote = vi.fn().mockResolvedValue(undefined)
    renderOrders({ onSetOrderOrganizerNote })

    await user.click(screen.getByRole('button', { name: '編輯 1E7 備註' }))
    await user.type(screen.getByRole('textbox', { name: '1E7 備註' }), '不要存{Escape}')
    expect(onSetOrderOrganizerNote).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '編輯 1E7 備註' })).toHaveTextContent('新增備註')

    await user.click(screen.getByRole('button', { name: '編輯 2I7 備註' }))
    await user.type(screen.getByRole('textbox', { name: '2I7 備註' }), '放門口')
    await user.tab()
    expect(onSetOrderOrganizerNote).toHaveBeenCalledWith('order-3', '放門口')
  })

  it('keeps the note editor open with the error when saving fails', async () => {
    const user = userEvent.setup()
    renderOrders({ onSetOrderOrganizerNote: vi.fn().mockRejectedValue(new Error('儲存備註失敗：network')) })

    await user.click(screen.getByRole('button', { name: '編輯 H11 備註' }))
    await user.type(screen.getByRole('textbox', { name: 'H11 備註' }), '補充{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('儲存備註失敗：network')
    expect(screen.getByRole('textbox', { name: 'H11 備註' })).toHaveValue('請放管理室補充')
    expect(screen.getByRole('textbox', { name: 'H11 備註' })).toHaveFocus()
  })

  it('does not overwrite a note being typed when fresh order data arrives', async () => {
    const user = userEvent.setup()
    const { rerender } = renderOrders({ onSetOrderOrganizerNote: vi.fn() })

    await user.click(screen.getByRole('button', { name: '編輯 H11 備註' }))
    const input = screen.getByRole('textbox', { name: 'H11 備註' })
    await user.clear(input)
    await user.type(input, '正在輸入')
    const refreshed = { ...summary, orderRows: summary.orderRows.map((order) => order.orderId === 'order-1' ? { ...order, organizerNote: '別人改的' } : order) }
    rerender(<OrdersSection campaignTitle="一涼製冰所" openedAt="2026-09-20T00:00:00.000Z" summary={refreshed} status="open" liveState="live" onSetOrderOrganizerNote={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'H11 備註' })).toHaveValue('正在輸入')
  })

  it('locks only the order row being updated', async () => {
    const user = userEvent.setup()
    let finish: (() => void) | undefined
    const onSetOrderOrganizerNote = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    renderOrders({ onSetOrderOrganizerNote })

    await user.click(screen.getByRole('button', { name: '編輯 H11 備註' }))
    await user.type(screen.getByRole('textbox', { name: 'H11 備註' }), '！{Enter}')

    expect(rowOf(/H11/)).toHaveAttribute('aria-busy', 'true')
    const noteInput = screen.getByRole('textbox', { name: 'H11 備註' })
    expect(noteInput).toHaveAttribute('readonly')
    expect(noteInput).toHaveFocus()
    expect(screen.getByRole('button', { name: '編輯 1E7 備註' })).toBeEnabled()
    await user.keyboard('{Enter}')
    expect(onSetOrderOrganizerNote).toHaveBeenCalledTimes(1)
    finish?.()
    await waitFor(() => expect(rowOf(/H11/)).not.toHaveAttribute('aria-busy'))
  })

  it('does not pull focus back to the note button when the organizer tabbed away mid-save', async () => {
    const user = userEvent.setup()
    let finish: (() => void) | undefined
    const onSetOrderOrganizerNote = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    renderOrders({ onSetOrderOrganizerNote })

    await user.click(screen.getByRole('button', { name: '編輯 H11 備註' }))
    await user.type(screen.getByRole('textbox', { name: 'H11 備註' }), '！{Enter}')
    expect(screen.getByRole('textbox', { name: 'H11 備註' })).toHaveAttribute('readonly')

    // The organizer moves on to another control (e.g. the row's 更多操作 menu)
    // while the save is still pending.
    const elsewhere = screen.getByRole('button', { name: '編輯 1E7 備註' })
    elsewhere.focus()
    expect(elsewhere).toHaveFocus()

    finish?.()
    await waitFor(() => expect(onSetOrderOrganizerNote).toHaveBeenCalledWith('order-1', '請放管理室！'))
    await waitFor(() => expect(screen.getByRole('button', { name: '編輯 H11 備註' })).toBeInTheDocument())
    expect(elsewhere).toHaveFocus()
  })

  it('cancels a whole order only while open and only after confirmation', async () => {
    const user = userEvent.setup()
    const onCancelOrder = vi.fn().mockResolvedValue(undefined)
    const { rerender } = renderOrders({ onCancelOrder })

    await user.click(screen.getByRole('button', { name: '更多操作 H11・佩怡' }))
    await user.click(screen.getByRole('menuitem', { name: '取消 H11 訂單' }))
    const dialog = screen.getByRole('dialog', { name: '確認取消訂單' })
    expect(dialog).toHaveTextContent(/H11/)
    expect(dialog).not.toHaveTextContent(/付款/)
    expect(onCancelOrder).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '確認取消訂單' }))
    expect(onCancelOrder).toHaveBeenCalledWith('order-1')

    rerender(<OrdersSection campaignTitle="一涼製冰所" openedAt="2026-09-20T00:00:00.000Z" summary={summary} status="closed" liveState="live" onCancelOrder={onCancelOrder} />)
    expect(screen.queryByRole('button', { name: '更多操作 H11・佩怡' })).not.toBeInTheDocument()
  })

  it('labels orders from outside the community as 其他 and counts orders, not households', () => {
    const mixed: OrganizerOrderSummary = {
      ...summary,
      orderCount: 2,
      orderRows: [
        { ...summary.orderRows[0], orderId: 'o1', name: '甲', period: 2, unit: '2K13', householdKind: 'resident' },
        { ...summary.orderRows[0], orderId: 'o2', name: '丙', period: null, unit: null, householdKind: 'other' },
      ],
    }
    renderOrders({ summary: mixed, onSetOrderOrganizerNote: vi.fn() })

    expect(within(screen.getByLabelText('訂單總覽')).getByText('2 筆')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /其他\s*丙/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '編輯 其他 備註' })).toBeInTheDocument()
    expect(screen.queryByText(/null|NaN期/)).not.toBeInTheDocument()
  })

  it('keeps the hour on orders from yesterday or earlier so same-day orders can be told apart', () => {
    // 2026-09-26 12:00 in Taipei; the fixture orders were placed on 9/24 in Taipei.
    render(<OrdersSection campaignTitle="一涼製冰所" openedAt="2026-09-20T00:00:00.000Z" summary={summary} status="open" liveState="live" now={new Date('2026-09-26T04:00:00.000Z')} />)
    expect(within(rowOf(/H11/)).getByTitle('2026/09/24 18:00').textContent).toBe('9/24 18:00')
  })

  it('shows when each order was placed and when it was changed', () => {
    const now = new Date('2026-09-24T12:30:00.000Z')
    const edited: OrganizerOrderSummary = {
      ...summary,
      orderRows: summary.orderRows.map((order) => order.orderId === 'order-1'
        ? { ...order, updatedAt: '2026-09-24T12:25:00.000Z' }
        : order),
    }
    render(<OrdersSection campaignTitle="一涼製冰所" openedAt="2026-09-20T00:00:00.000Z" summary={edited} status="open" liveState="live" now={now} />)

    expect(screen.getByRole('columnheader', { name: '下單時間' })).toBeInTheDocument()
    const placed = within(rowOf(/H11/)).getByText('2 小時前')
    expect(placed.tagName).toBe('TIME')
    expect(placed).toHaveAttribute('title', '2026/09/24 18:00')
    expect(within(rowOf(/H11/)).getByText('已修改')).toHaveAttribute('title', '最後修改 2026/09/24 20:25')
    expect(within(rowOf(/H11/)).queryByText('5 分鐘前')).not.toBeInTheDocument()
    expect(within(rowOf(/2I7/)).getByText('30 分鐘前')).toBeInTheDocument()
    expect(within(rowOf(/2I7/)).queryByText(/已修改/)).not.toBeInTheDocument()
  })

  it('explains an empty order list', () => {
    renderOrders({ summary: { ...summary, orderCount: 0, orderRows: [] } })
    expect(screen.getByText('還沒有人下單')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
