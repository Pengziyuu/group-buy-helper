import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { BottomSheet } from './BottomSheet'

function Example() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>明細</button>
      {open && (
        <BottomSheet title="訂單明細" onClose={() => setOpen(false)}>
          <p>商品合計 $270</p>
          <a href="#more">更多說明</a>
        </BottomSheet>
      )}
    </>
  )
}

describe('BottomSheet', () => {
  it('opens as a labelled dialog, traps focus, and closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole('button', { name: '明細' })

    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: '訂單明細' })).toHaveTextContent('商品合計 $270')
    const close = screen.getByRole('button', { name: '關閉訂單明細' })
    expect(close).toHaveFocus()
    expect(document.body).toHaveStyle({ overflow: 'hidden' })

    await user.tab()
    expect(screen.getByRole('link', { name: '更多說明' })).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body).not.toHaveStyle({ overflow: 'hidden' })
    expect(trigger).toHaveFocus()
  })

  it('closes from the close button and the backdrop but not from inside the sheet', async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.click(screen.getByRole('button', { name: '明細' }))
    await user.click(screen.getByText('商品合計 $270'))
    expect(screen.getByRole('dialog', { name: '訂單明細' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '關閉訂單明細' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '明細' }))
    await user.click(screen.getByRole('dialog', { name: '訂單明細' }).parentElement!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
