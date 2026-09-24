import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditedMark, formatRelativeTime, RelativeTime, useNow } from './relativeTime'

const now = new Date('2026-09-25T04:00:00.000Z')

describe('formatRelativeTime', () => {
  it('uses just now, minutes, hours, then the Taipei date and time', () => {
    expect(formatRelativeTime('2026-09-25T03:59:40.000Z', now)).toBe('剛剛')
    expect(formatRelativeTime('2026-09-25T03:59:00.000Z', now)).toBe('1 分鐘前')
    expect(formatRelativeTime('2026-09-25T03:01:00.000Z', now)).toBe('59 分鐘前')
    expect(formatRelativeTime('2026-09-25T03:00:00.000Z', now)).toBe('1 小時前')
    expect(formatRelativeTime('2026-09-24T04:00:01.000Z', now)).toBe('23 小時前')
    expect(formatRelativeTime('2026-09-24T04:00:00.000Z', now)).toBe('09/24 12:00')
  })

  it('never shows a negative time for a clock that runs ahead, and ignores missing values', () => {
    expect(formatRelativeTime('2026-09-25T04:03:00.000Z', now)).toBe('剛剛')
    expect(formatRelativeTime(undefined, now)).toBe('')
    expect(formatRelativeTime(null, now)).toBe('')
    expect(formatRelativeTime('not a date', now)).toBe('')
  })
})

function Clock({ fixed }: { fixed?: Date }) {
  const current = useNow(fixed)
  return <p>{current.toISOString()}</p>
}

describe('useNow', () => {
  afterEach(() => { vi.useRealTimers() })

  it('refreshes once a minute and stops when unmounted', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const { unmount } = render(<Clock />)
    expect(screen.getByText('2026-09-25T04:00:00.000Z')).toBeInTheDocument()

    act(() => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByText('2026-09-25T04:01:00.000Z')).toBeInTheDocument()

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses a fixed time without starting a timer', () => {
    vi.useFakeTimers()
    render(<Clock fixed={now} />)
    expect(screen.getByText('2026-09-25T04:00:00.000Z')).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('RelativeTime', () => {
  it('shows the relative time with the full time as a hint', () => {
    render(<RelativeTime value="2026-09-25T03:57:00.000Z" now={now} />)
    const time = screen.getByText('3 分鐘前')
    expect(time.tagName).toBe('TIME')
    expect(time).toHaveAttribute('dateTime', '2026-09-25T03:57:00.000Z')
    expect(time).toHaveAttribute('title', '2026/09/25 11:57')
  })

  it('renders nothing for a missing time', () => {
    const { container } = render(<RelativeTime value={undefined} now={now} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('EditedMark', () => {
  it('says the order was changed and keeps the change time as a hint', () => {
    render(<EditedMark value="2026-09-25T03:59:30.000Z" />)
    const mark = screen.getByText('已修改')
    expect(mark.tagName).toBe('TIME')
    expect(mark).toHaveAttribute('dateTime', '2026-09-25T03:59:30.000Z')
    expect(mark).toHaveAttribute('title', '最後修改 2026/09/25 11:59')
  })

  it('renders nothing for a missing time', () => {
    const { container } = render(<EditedMark value={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
