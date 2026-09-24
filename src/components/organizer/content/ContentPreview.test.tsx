import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ContentPreview } from './ContentPreview'

const props = {
  status: 'open' as const,
  title: '冰餅團',
  priceText: '$45～$50',
  arrivalLabel: '03/08',
  autoCloseAt: '2027-10-15T04:00:00.000Z',
  thresholdText: '結單：100 個成團',
  allowCustomItems: true,
  images: [{ src: '/a.png', alt: '冰餅照' }],
  announcement: '第一行\n第二行',
  items: [
    { code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true },
    { code: 'ITEM2', name: '', unitPrice: 50, active: true },
    { code: 'ITEM3', name: '舊口味', unitPrice: 40, active: false },
  ],
}

describe('ContentPreview', () => {
  it('shows what residents will see without adding page headings', () => {
    render(<ContentPreview {...props} />)
    const preview = screen.getByRole('region', { name: '住戶端預覽' })

    expect(within(preview).getByText('開團中')).toBeInTheDocument()
    expect(within(preview).getByText('冰餅團')).toBeInTheDocument()
    expect(within(preview).getByText('$45～$50')).toBeInTheDocument()
    expect(within(preview).getByText('預計到貨：03/08')).toBeInTheDocument()
    expect(within(preview).getByText('10/15 12:00 自動結單')).toBeInTheDocument()
    expect(within(preview).getByText('結單：100 個成團')).toBeInTheDocument()
    expect(within(preview).getByText('可新增自訂額外品項，金額由團主另計')).toBeInTheDocument()
    expect(within(preview).getByRole('region', { name: '住戶端圖片預覽，共 1 張' })).toHaveAttribute('tabindex', '0')
    expect(within(preview).getByRole('img', { name: '冰餅照' })).toBeInTheDocument()
    expect(within(preview).queryByRole('button', { name: /放大檢視/ })).not.toBeInTheDocument()
    expect(within(preview).queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    const itemList = within(preview).getByRole('list', { name: '品項預覽' })
    expect(within(itemList).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['A牛奶$45', 'B未命名品項$50'])
  })

  it('names an untitled campaign and shows a closed or legacy arrived campaign as closed', () => {
    render(<ContentPreview {...props} title=" " status="arrived" />)
    const preview = screen.getByRole('region', { name: '住戶端預覽' })

    expect(within(preview).getByText('未命名團購')).toBeInTheDocument()
    expect(within(preview).getByText('已結單')).toBeInTheDocument()
    expect(within(preview).queryByText('開團中')).not.toBeInTheDocument()
  })

  it('expands and collapses the announcement', async () => {
    const user = userEvent.setup()
    render(<ContentPreview {...props} />)

    const expand = screen.getByRole('button', { name: '展開完整預覽' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    await user.click(expand)
    expect(screen.getByRole('button', { name: '收合完整預覽' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('switches between the phone and the desktop layout, and the scaled desktop view is not interactive', async () => {
    const user = userEvent.setup()
    const { container } = render(<ContentPreview {...props} />)
    const frame = () => container.querySelector('.content-preview-frame')

    expect(screen.getByRole('radio', { name: '手機' })).toBeChecked()
    expect(frame()).toHaveAttribute('data-device', 'phone')
    expect(frame()).not.toHaveAttribute('inert')

    await user.click(screen.getByRole('radio', { name: '電腦' }))
    expect(frame()).toHaveAttribute('data-device', 'desktop')
    expect(frame()).toHaveAttribute('inert')
  })
})
