import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { initialOrders, items } from '../../data/demo'
import { buildOrganizerOrderSummary, type OrganizerOrderSummary } from '../../domain/adminOrders'
import { ExportOrdersButton } from './ExportOrdersButton'

const base = buildOrganizerOrderSummary({ orders: initialOrders, items, threshold: 100 })
const summary: OrganizerOrderSummary = {
  ...base,
  orderRows: base.orderRows.map((order, index) => ({
    ...order,
    orderId: `order-${index + 1}`,
    // Preserve the order rows used by the existing export cases.
    orderedAt: `2026-09-24T1${index}:00:00.000Z`,
    updatedAt: index === 1 ? '2026-09-25T03:57:00.000Z' : `2026-09-24T1${index}:00:00.000Z`,
  })),
}

describe('ExportOrdersButton', () => {
  it('exports only after closing and explains why it is disabled', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<ExportOrdersButton summary={summary} campaignTitle="榮泉餅店" openedAt="2026-09-11T05:00:00.000Z" status="open" onExport={onExport} />)
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeDisabled()
    expect(screen.getByText('結單後才能匯出')).toBeInTheDocument()

    rerender(<ExportOrdersButton summary={summary} campaignTitle="榮泉餅店" openedAt="2026-09-11T05:00:00.000Z" status="closed" onExport={onExport} />)
    await user.click(screen.getByRole('button', { name: '匯出 Excel' }))
    expect(onExport).toHaveBeenCalledOnce()

    rerender(<ExportOrdersButton summary={summary} campaignTitle="榮泉餅店" openedAt="2026-09-11T05:00:00.000Z" status="arrived" onExport={onExport} />)
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeEnabled()
  })

  it('disables export for empty shells but enables custom-only orders', () => {
    const emptyShell = { ...summary.orderRows[0], items: { A: 0 }, customItems: [{ id: 'blank', name: '   ', quantity: 0 }] }
    const { rerender } = render(
      <ExportOrdersButton summary={{ ...summary, orderCount: 0, orderRows: [emptyShell] }} campaignTitle="空團" openedAt="2026-09-11T05:00:00.000Z" status="closed" />,
    )
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeDisabled()
    expect(screen.getByText('目前沒有可匯出的訂單')).toBeInTheDocument()

    rerender(
      <ExportOrdersButton
        summary={{ ...summary, orderCount: 1, orderRows: [{ ...emptyShell, customItems: [{ id: 'bag', name: '紙袋', quantity: 1 }] }] }}
        campaignTitle="額外品項團"
        openedAt="2026-09-11T05:00:00.000Z"
        status="arrived"
      />,
    )
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeEnabled()
  })

  it('shows an export failure without leaving the button busy', async () => {
    const user = userEvent.setup()
    render(<ExportOrdersButton summary={summary} campaignTitle="榮泉餅店" openedAt="2026-09-11T05:00:00.000Z" status="closed" onExport={vi.fn().mockRejectedValue(new Error('建立 Excel 失敗'))} />)
    await user.click(screen.getByRole('button', { name: '匯出 Excel' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('建立 Excel 失敗')
    expect(screen.getByRole('button', { name: '匯出 Excel' })).toBeEnabled()
  })
})
