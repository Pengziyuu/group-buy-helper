import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LiveStatus } from './LiveStatus'

describe('LiveStatus', () => {
  it('keeps keyboard focus on the status that replaces the retry button', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<LiveStatus state="offline" onRetry={onRetry} />)

    await user.click(screen.getByRole('button', { name: '重新同步' }))
    expect(onRetry).toHaveBeenCalledOnce()
    rerender(<LiveStatus state="connecting" onRetry={onRetry} />)

    expect(screen.getByText('連線中…')).toHaveFocus()
  })

  it('does not take focus when the status changes on its own', () => {
    const { rerender } = render(<LiveStatus state="connecting" />)
    rerender(<LiveStatus state="live" />)
    expect(screen.getByText('即時更新')).not.toHaveFocus()
  })

  it('refocuses the retry button when a retry falls back to offline instead of reaching live', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<LiveStatus state="offline" onRetry={onRetry} />)

    await user.click(screen.getByRole('button', { name: '重新同步' }))
    rerender(<LiveStatus state="connecting" onRetry={onRetry} />)
    expect(screen.getByText('連線中…')).toHaveFocus()

    rerender(<LiveStatus state="offline" onRetry={onRetry} />)
    expect(screen.getByRole('button', { name: '重新同步' })).toHaveFocus()
  })

  it('stops tracking focus once a retry reaches live, so a later offline does not steal it', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<LiveStatus state="offline" onRetry={onRetry} />)

    await user.click(screen.getByRole('button', { name: '重新同步' }))
    rerender(<LiveStatus state="connecting" onRetry={onRetry} />)
    rerender(<LiveStatus state="live" onRetry={onRetry} />)

    const elsewhere = document.createElement('button')
    document.body.appendChild(elsewhere)
    elsewhere.focus()
    expect(elsewhere).toHaveFocus()

    rerender(<LiveStatus state="offline" onRetry={onRetry} />)
    expect(elsewhere).toHaveFocus()
    elsewhere.remove()
  })
})
