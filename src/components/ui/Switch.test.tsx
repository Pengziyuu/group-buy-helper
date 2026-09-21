import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch', () => {
  it('exposes a labelled switch with its description', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    const { rerender } = render(
      <Switch label="全團基本折扣" description="所有品項都打折，例如 9 折" checked={false} onChange={change} />,
    )

    const toggle = screen.getByRole('switch', { name: '全團基本折扣' })
    expect(toggle).not.toBeChecked()
    expect(toggle).toHaveAccessibleDescription('所有品項都打折，例如 9 折')

    await user.click(toggle)
    expect(change).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByText('全團基本折扣'))
    expect(change).toHaveBeenCalledTimes(2)

    rerender(<Switch label="全團基本折扣" checked onChange={change} disabled />)
    expect(screen.getByRole('switch', { name: '全團基本折扣' })).toBeChecked()
    expect(screen.getByRole('switch', { name: '全團基本折扣' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: '全團基本折扣' })).not.toHaveAttribute('aria-describedby')
  })
})
