import { lazy, Suspense } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { LazySectionBoundary } from './LazySectionBoundary'

it('offers a visible reload path when a lazily loaded section fails', async () => {
  const Failure = lazy(() => Promise.reject(new Error('network')))
  const reload = vi.fn()
  const user = userEvent.setup()
  const originalError = console.error
  console.error = vi.fn() // React intentionally logs the error caught by the boundary.
  try {
    render(<LazySectionBoundary onReload={reload}>
      <Suspense fallback={<p>載入中…</p>}>
        <Failure />
      </Suspense>
    </LazySectionBoundary>)
    expect(await screen.findByRole('alert')).toHaveTextContent('畫面暫時無法載入')
    await user.click(screen.getByRole('button', { name: '重新載入頁面' }))
    expect(reload).toHaveBeenCalledOnce()
  } finally {
    console.error = originalError
  }
})
