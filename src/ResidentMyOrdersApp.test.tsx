import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ResidentMyOrdersApp, { type ResidentMyOrder } from './ResidentMyOrdersApp'

const identity = { displayName: '彭梓育', pictureUrl: null }
const now = new Date('2026-10-06T01:00:00.000Z')

function order(overrides: Partial<ResidentMyOrder> & Pick<ResidentMyOrder, 'slug' | 'title'>): ResidentMyOrder {
  return {
    status: 'open',
    openedAt: '2026-10-01T00:00:00.000Z',
    orderedAt: '2026-10-02T00:00:00.000Z',
    images: [],
    quantityUnit: '個',
    arrivalLabel: '貨到通知',
    autoCloseAt: null,
    thresholdKind: 'quantity',
    thresholdAutoClose: true,
    closedAt: null,
    items: [],
    customItems: [],
    ...overrides,
  }
}

const card = (title: string) => screen.getByRole('article', { name: title })

describe('ResidentMyOrdersApp', () => {
  it('lists each order with its items, subtotals and total, open campaigns first', () => {
    render(<ResidentMyOrdersApp identity={identity} now={now} orders={[
      order({
        slug: 'abcd1234', title: '手工蛋捲禮盒', status: 'closed', quantityUnit: '盒',
        openedAt: '2026-10-03T00:00:00.000Z', closedAt: '2026-10-04T04:00:00.000Z',
        items: [{ name: '原味', quantity: 1, unitPrice: 280 }],
        customItems: [{ name: '海苔肉鬆', quantity: 1 }],
      }),
      order({
        slug: 'efgh5678', title: '一涼製冰所 超厚三明治冰餅', autoCloseAt: '2026-10-11T04:46:00.000Z',
        images: [{ src: '/ice.png', alt: '冰餅照' }],
        items: [{ name: '牛奶（招牌）', quantity: 2, unitPrice: 45 }, { name: 'OREO', quantity: 2, unitPrice: 45 }],
      }),
    ]} />)

    expect(screen.getAllByRole('article').map((article) => article.getAttribute('aria-label')))
      .toEqual(['一涼製冰所 超厚三明治冰餅', '手工蛋捲禮盒'])

    const open = card('一涼製冰所 超厚三明治冰餅')
    expect(within(open).getByText('開團中')).toBeInTheDocument()
    expect(within(open).getByRole('img', { name: '冰餅照' })).toBeInTheDocument()
    expect(within(open).getByText('10/11 12:46 結單・貨到通知')).toBeInTheDocument()
    expect(within(within(open).getByRole('list', { name: '訂購品項' })).getAllByRole('listitem').map((item) => item.textContent))
      .toEqual(['牛奶（招牌） × 2$90', 'OREO × 2$90'])
    expect(within(open).getByText('合計 4 個・$180')).toBeInTheDocument()
    // Straight to the 我的訂單 section of the campaign page.
    expect(within(open).getByRole('link', { name: '修改訂單' })).toHaveAttribute('href', '/c/efgh5678#my-order')

    const closed = card('手工蛋捲禮盒')
    expect(within(closed).getByText('已結單')).toBeInTheDocument()
    expect(within(closed).getByText('10/4 結單・貨到通知')).toBeInTheDocument()
    expect(within(within(closed).getByRole('list', { name: '訂購品項' })).getAllByRole('listitem').map((item) => item.textContent))
      .toEqual(['原味 × 1$280', '海苔肉鬆 +1・另計'])
    expect(within(closed).getByText('合計 1 盒・$280')).toBeInTheDocument()
    expect(within(closed).getByRole('link', { name: '查看' })).toHaveAttribute('href', '/c/abcd1234#my-order')
  })

  it('puts open campaigns first, then the newest order first within each group', () => {
    render(<ResidentMyOrdersApp identity={identity} now={now} orders={[
      order({ slug: 'closed-new', title: '已結單・新訂', status: 'closed', orderedAt: '2026-10-05T00:00:00.000Z', items: [{ name: 'A', quantity: 1, unitPrice: 1 }] }),
      order({ slug: 'open-old', title: '開團中・舊訂', openedAt: '2026-10-04T00:00:00.000Z', orderedAt: '2026-10-01T00:00:00.000Z', items: [{ name: 'A', quantity: 1, unitPrice: 1 }] }),
      order({ slug: 'open-new', title: '開團中・新訂', openedAt: '2026-09-01T00:00:00.000Z', orderedAt: '2026-10-03T00:00:00.000Z', items: [{ name: 'A', quantity: 1, unitPrice: 1 }] }),
      order({ slug: 'closed-old', title: '已結單・舊訂', status: 'closed', orderedAt: '2026-09-01T00:00:00.000Z', items: [{ name: 'A', quantity: 1, unitPrice: 1 }] }),
    ]} />)

    // Ordered by when the resident ordered, not when the campaign opened.
    expect(screen.getAllByRole('article').map((article) => article.getAttribute('aria-label')))
      .toEqual(['開團中・新訂', '開團中・舊訂', '已結單・新訂', '已結單・舊訂'])
  })

  it('leaves out the total when only custom items were ordered', () => {
    render(<ResidentMyOrdersApp identity={identity} now={now} orders={[
      order({ slug: 'abcd1234', title: '只訂額外品項', customItems: [{ name: '限定蛋糕', quantity: 2 }] }),
    ]} />)

    expect(within(card('只訂額外品項')).getByText('限定蛋糕 +2・另計')).toBeInTheDocument()
    expect(within(card('只訂額外品項')).queryByText(/合計/)).not.toBeInTheDocument()
  })

  it('invites the resident back to the campaigns when there are no orders yet', () => {
    render(<ResidentMyOrdersApp identity={identity} now={now} orders={[]} />)

    expect(screen.getByText('還沒有訂單')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '看看團購' })).toHaveAttribute('href', '/')
    expect(within(screen.getByRole('navigation', { name: '住戶頁面' })).getByRole('link', { name: '我的訂單' }))
      .toHaveAttribute('aria-current', 'page')
  })
})
