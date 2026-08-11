import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { initialOrders, items } from './data/demo'
import { buildOrganizerOrderSummary } from './domain/adminOrders'
import AdminOrdersPanel from './AdminOrdersPanel'

describe('organizer orders panel', () => {
  it('shows campaign totals, item breakdown and resident orders', () => {
    const summary = buildOrganizerOrderSummary({
      orders: initialOrders,
      items,
      unitPrice: 45,
      threshold: 100,
    })

    render(<AdminOrdersPanel summary={summary} />)

    expect(screen.getByRole('heading', { name: '訂單統計' })).toBeInTheDocument()
    expect(screen.getByText('6 戶')).toBeInTheDocument()
    expect(screen.getByText('62 個')).toBeInTheDocument()
    expect(screen.getByText('$2,790')).toBeInTheDocument()
    expect(screen.getByText('還差 38 個成團')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /B 花生（招牌） 14 個/ })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /2K13 斯祈 花生（招牌）×2、草莓×2、可可×2 6 個/ })).toBeInTheDocument()
  })
})
