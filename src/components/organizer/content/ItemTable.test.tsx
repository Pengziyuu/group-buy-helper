import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignItem } from '../../../services/demoCampaignStore'
import { ItemTable } from './ItemTable'

const baseItems: CampaignItem[] = [
  { code: 'ITEM1', name: '牛奶', unitPrice: 45, active: true },
  { code: 'ITEM2', name: '花生', unitPrice: 50, active: true },
]

function Harness({ initial = baseItems, locked = false, mixMatchEnabled = false, onChange = vi.fn() }: {
  initial?: CampaignItem[]
  locked?: boolean
  mixMatchEnabled?: boolean
  onChange?: (items: CampaignItem[]) => void
}) {
  const [items, setItems] = useState(initial)
  return (
    <ItemTable
      items={items}
      locked={locked}
      disabled={false}
      mixMatchEnabled={mixMatchEnabled}
      onChange={(next) => { onChange(next); setItems(next) }}
    />
  )
}

describe('ItemTable', () => {
  it('adds one row from Enter in the last price, inheriting that price, and focuses its name', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await user.click(screen.getByRole('spinbutton', { name: '品項 B 單價' }))
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('rowheader', { name: 'C' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '品項 C 單價' })).toHaveValue(50)
    const name = screen.getByRole('textbox', { name: '品項 C 商品名稱（口味）' })
    expect(name).toHaveValue('')
    expect(name).toHaveFocus()
  })

  it('does not add a row from Enter on another row or while an input method is composing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await user.click(screen.getByRole('spinbutton', { name: '品項 A 單價' }))
    await user.keyboard('{Enter}')
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: '品項 B 單價' }), { key: 'Enter', isComposing: true })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('rowheader', { name: 'C' })).not.toBeInTheDocument()
  })

  it('stops adding rows at the item limit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const full = Array.from({ length: 100 }, (_, index) => ({
      code: `ITEM${index + 1}`, name: `口味${index + 1}`, unitPrice: 10, active: true,
    }))
    render(<Harness initial={full} onChange={onChange} />)

    expect(screen.getByRole('button', { name: '增加品項' })).toBeDisabled()
    await user.click(screen.getByRole('spinbutton', { name: '品項 CV 單價' }))
    await user.keyboard('{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('adds a row from the button too', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '增加品項' }))

    expect(screen.getByRole('textbox', { name: '品項 C 商品名稱（口味）' })).toHaveFocus()
  })

  it('applies one price to every item', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.getByRole('button', { name: '全部套用' })).toBeDisabled()
    await user.type(screen.getByRole('spinbutton', { name: '統一單價' }), '60')
    await user.click(screen.getByRole('button', { name: '全部套用' }))

    expect(screen.getByRole('spinbutton', { name: '品項 A 單價' })).toHaveValue(60)
    expect(screen.getByRole('spinbutton', { name: '品項 B 單價' })).toHaveValue(60)
  })

  it('removes only the last item and always keeps one', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '減少品項' }))

    expect(screen.queryByRole('rowheader', { name: 'B' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '品項 A 商品名稱（口味）' })).toHaveValue('牛奶')
    expect(screen.getByRole('button', { name: '減少品項' })).toBeDisabled()
  })

  it('offers the mix-and-match column only when that discount is on, and not for inactive items', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const items: CampaignItem[] = [...baseItems, { code: 'ITEM3', name: '舊口味', unitPrice: 40, active: false }]
    const { rerender } = render(<ItemTable items={items} locked={false} disabled={false} mixMatchEnabled={false} onChange={onChange} />)
    expect(screen.queryByRole('columnheader', { name: '參加任選' })).not.toBeInTheDocument()

    rerender(<ItemTable items={items} locked={false} disabled={false} mixMatchEnabled onChange={onChange} />)
    expect(screen.getByRole('columnheader', { name: '參加任選' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '品項 C 加入任選優惠' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: '品項 A 加入任選優惠' }))
    expect(onChange).toHaveBeenCalledWith([{ ...baseItems[0], discountEligible: true }, baseItems[1], items[2]])
  })

  it('toggles the mix-and-match checkbox by clicking its wrapping hit-area label', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ItemTable items={baseItems} locked={false} disabled={false} mixMatchEnabled onChange={onChange} />)

    const checkbox = screen.getByRole('checkbox', { name: '品項 A 加入任選優惠' })
    await user.click(checkbox.closest('label')!)

    expect(onChange).toHaveBeenCalledWith([{ ...baseItems[0], discountEligible: true }, baseItems[1]])
  })

  it('locks every field and hides the editing controls once the campaign has opened', () => {
    const onChange = vi.fn()
    render(<Harness locked mixMatchEnabled onChange={onChange} />)

    expect(screen.getByRole('textbox', { name: '品項 A 商品名稱（口味）' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: '品項 B 單價' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: '品項 A 加入任選優惠' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '增加品項' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '減少品項' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '統一單價' })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: '品項 B 單價' }), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })
})
