import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toast } from './Toast'

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('announces the message and dismisses itself after five seconds', () => {
    vi.useFakeTimers()
    const dismiss = vi.fn()
    render(<Toast message="已將斯祈標記為已付款" onDismiss={dismiss} />)

    expect(screen.getByRole('status')).toHaveTextContent('已將斯祈標記為已付款')
    act(() => { vi.advanceTimersByTime(4999) })
    expect(dismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('pauses while hovered and restarts the countdown when left', () => {
    vi.useFakeTimers()
    const dismiss = vi.fn()
    render(<Toast message="已儲存" onDismiss={dismiss} />)

    fireEvent.mouseEnter(screen.getByRole('status'))
    act(() => { vi.advanceTimersByTime(10000) })
    expect(dismiss).not.toHaveBeenCalled()
    fireEvent.mouseLeave(screen.getByRole('status'))
    act(() => { vi.advanceTimersByTime(4999) })
    expect(dismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('runs the undo action and then closes', () => {
    const undo = vi.fn()
    const dismiss = vi.fn()
    render(<Toast message="已將斯祈標記為已付款" actionLabel="復原" onAction={undo} onDismiss={dismiss} />)

    fireEvent.click(screen.getByRole('button', { name: '復原' }))
    expect(undo).toHaveBeenCalledOnce()
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('stays paused while focus is inside even after the pointer leaves', () => {
    vi.useFakeTimers()
    const dismiss = vi.fn()
    render(<Toast message="已儲存" actionLabel="復原" onAction={vi.fn()} onDismiss={dismiss} />)
    const toast = screen.getByRole('status')
    const undo = screen.getByRole('button', { name: '復原' })

    fireEvent.mouseEnter(toast)
    fireEvent.focusIn(undo)
    fireEvent.mouseLeave(toast)
    act(() => { vi.advanceTimersByTime(10000) })
    expect(dismiss).not.toHaveBeenCalled()

    fireEvent.focusOut(undo, { relatedTarget: null })
    act(() => { vi.advanceTimersByTime(4999) })
    expect(dismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(dismiss).toHaveBeenCalledOnce()
  })
})
