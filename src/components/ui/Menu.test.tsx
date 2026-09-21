import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Menu } from './Menu'

describe('Menu', () => {
  it('opens a keyboard-navigable overflow menu and returns focus on Escape', async () => {
    const user = userEvent.setup()
    render(
      <Menu
        label="更多操作 冰餅團"
        items={[
          { label: '複製住戶連結', onSelect: vi.fn() },
          { label: '查看住戶頁', href: '/campaign/abc', target: '_blank' },
          { label: '刪除團購', onSelect: vi.fn(), tone: 'danger' },
        ]}
      />,
    )

    const trigger = screen.getByRole('button', { name: '更多操作 冰餅團' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    expect(screen.getByRole('menuitem', { name: '複製住戶連結' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: '查看住戶頁' })).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: '查看住戶頁' })).toHaveAttribute('href', '/campaign/abc')
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: '刪除團購' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('runs the chosen action once, closes, and focuses the trigger', async () => {
    const user = userEvent.setup()
    const copy = vi.fn()
    render(<Menu label="更多操作 冰餅團" items={[{ label: '複製住戶連結', onSelect: copy }]} />)

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    await user.click(screen.getByRole('menuitem', { name: '複製住戶連結' }))

    expect(copy).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更多操作 冰餅團' })).toHaveFocus()
  })

  it('ignores disabled items and closes on an outside click', async () => {
    const user = userEvent.setup()
    const cancel = vi.fn()
    render(<Menu label="訂單操作 斯祈" items={[{ label: '取消整筆訂單', onSelect: cancel, disabled: true }]} />)

    await user.click(screen.getByRole('button', { name: '訂單操作 斯祈' }))
    const item = screen.getByRole('menuitem', { name: '取消整筆訂單' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    await user.click(item)
    expect(cancel).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('keeps a menu with only a disabled item operable from the keyboard', async () => {
    const user = userEvent.setup()
    const cancel = vi.fn()
    render(
      <>
        <Menu label="訂單操作 斯祈" items={[{ label: '取消整筆訂單', onSelect: cancel, disabled: true }]} />
        <button type="button">下一列</button>
      </>,
    )

    const trigger = screen.getByRole('button', { name: '訂單操作 斯祈' })
    await user.click(trigger)
    const item = screen.getByRole('menuitem', { name: '取消整筆訂單' })
    expect(item).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(cancel).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    await user.tab()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('gives repeated row actions a distinct accessible name', async () => {
    const user = userEvent.setup()
    render(<Menu label="更多操作 冰餅團" items={[{ label: '刪除團購', ariaLabel: '刪除 冰餅團', onSelect: vi.fn() }]} />)

    await user.click(screen.getByRole('button', { name: '更多操作 冰餅團' }))
    expect(screen.getByRole('menuitem', { name: '刪除 冰餅團' })).toHaveTextContent('刪除團購')
  })
})
