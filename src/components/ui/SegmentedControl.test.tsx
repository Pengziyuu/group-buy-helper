import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

describe('SegmentedControl', () => {
  it('works as a labelled radio group with optional counts', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    render(
      <SegmentedControl
        label="付款篩選"
        value="all"
        onChange={change}
        options={[
          { value: 'all', label: '全部', count: 50 },
          { value: 'unpaid', label: '未付款', count: 18 },
          { value: 'paid', label: '已付款', count: 32, disabled: true },
        ]}
      />,
    )

    expect(screen.getByRole('radiogroup', { name: '付款篩選' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '全部 50' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: '未付款 18' }))
    expect(change).toHaveBeenCalledWith('unpaid')
    expect(screen.getByRole('radio', { name: '已付款 32' })).toBeDisabled()
  })

  it('omits the count when none is given', () => {
    render(
      <SegmentedControl
        label="成團門檻"
        value="quantity"
        onChange={vi.fn()}
        options={[{ value: 'quantity', label: '數量' }, { value: 'amount', label: '總金額' }]}
      />,
    )

    expect(screen.getByRole('radio', { name: '數量' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '總金額' })).not.toBeChecked()
  })
})
