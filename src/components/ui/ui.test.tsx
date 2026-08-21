import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button, IconButton } from './Button'
import { FormField } from './FormField'
import { StatusBadge } from './StatusBadge'
import { ProgressBar } from './ProgressBar'
import { FeedbackMessage } from './FeedbackMessage'
import { EmptyState, ErrorState, LoadingState } from './AsyncState'
import { ConfirmDialog } from './ConfirmDialog'
import { QuantityControl } from './QuantityControl'
import { AppHeader, Breadcrumbs, SectionNav } from './Navigation'
import { StickyActionBar } from './StickyActionBar'

describe('shared UI primitives', () => {
  it('exposes button hierarchy and a stable processing state', () => {
    render(<>
      <Button variant="primary" loading>儲存</Button>
      <Button variant="primary" loading loadingLabel="LINE驗證中…">使用 LINE 登入</Button>
      <Button variant="secondary">取消</Button>
      <Button variant="tertiary">更多</Button>
      <Button variant="destructive">刪除</Button>
      <IconButton label="關閉">×</IconButton>
    </>)

    expect(screen.getByRole('button', { name: '儲存中…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'LINE驗證中…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toHaveAttribute('data-variant', 'secondary')
    expect(screen.getByRole('button', { name: '更多' })).toHaveAttribute('data-variant', 'tertiary')
    expect(screen.getByRole('button', { name: '刪除' })).toHaveAttribute('data-variant', 'destructive')
    expect(screen.getByRole('button', { name: '關閉' })).toHaveTextContent('×')
  })

  it('connects form labels, helper copy, and inline validation', () => {
    render(
      <FormField id="campaign-title" label="團購標題" helper="最多 200 字" error="請填寫團購標題">
        <input />
      </FormField>,
    )

    expect(screen.getByRole('textbox', { name: '團購標題' })).toHaveAccessibleDescription('最多 200 字 請填寫團購標題')
    expect(screen.getByRole('alert')).toHaveTextContent('請填寫團購標題')
  })

  it('renders semantic status, progress, and feedback without relying on color alone', () => {
    render(<>
      <StatusBadge tone="success">收單中</StatusBadge>
      <ProgressBar label="成團進度" value={120} max={100} />
      <FeedbackMessage tone="error">儲存失敗</FeedbackMessage>
      <FeedbackMessage tone="success">儲存成功</FeedbackMessage>
    </>)

    expect(screen.getByText('收單中')).toHaveAttribute('data-tone', 'success')
    expect(screen.getByRole('progressbar', { name: '成團進度' })).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByRole('alert')).toHaveTextContent('儲存失敗')
    expect(screen.getByRole('status')).toHaveTextContent('儲存成功')
  })

  it('provides consistent loading, empty, and recoverable error states', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    render(<>
      <LoadingState label="載入團購中…" />
      <EmptyState title="目前沒有團購" description="建立第一團吧。" />
      <ErrorState title="無法載入" message="網路連線中斷" actionLabel="重試" onAction={retry} />
    </>)

    expect(screen.getByRole('status', { name: '載入團購中…' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('目前沒有團購')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('supports keyboard-safe confirmation and restores focus', async () => {
    const user = userEvent.setup()
    const confirm = vi.fn()

    function Example() {
      const [open, setOpen] = useState(false)
      return <>
        <button type="button" onClick={() => setOpen(true)}>刪除團購</button>
        {open && (
          <ConfirmDialog
            title="確認刪除團購"
            confirmLabel="確認永久刪除"
            onConfirm={confirm}
            onCancel={() => setOpen(false)}
          >無法復原。</ConfirmDialog>
        )}
      </>
    }

    render(<Example />)
    const trigger = screen.getByRole('button', { name: '刪除團購' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: '確認刪除團購' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('keeps focus inside a processing confirmation dialog', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog title="處理訂單" confirmLabel="確認" busy onConfirm={vi.fn()} onCancel={onCancel}>
        正在更新，請稍候。
      </ConfirmDialog>,
    )

    expect(screen.getByRole('dialog', { name: '處理訂單' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('uses accessible 0–20 quantity controls and disables reached boundaries', async () => {
    const user = userEvent.setup()
    const decrement = vi.fn()
    const increment = vi.fn()
    const { rerender } = render(
      <QuantityControl label="A號" value={0} onDecrement={decrement} onIncrement={increment} />,
    )

    expect(screen.getByRole('button', { name: '減少 A號' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '增加 A號' }))
    expect(increment).toHaveBeenCalledOnce()

    rerender(<QuantityControl label="A號" value={20} onDecrement={decrement} onIncrement={increment} />)
    expect(screen.getByRole('button', { name: '增加 A號' })).toBeDisabled()
  })

  it('provides lightweight app and section navigation with a sticky action container', () => {
    render(<>
      <AppHeader title="團購小幫手" leading={<a href="/">全部開團</a>} trailing={<button>登出</button>} />
      <Breadcrumbs items={[{ label: '我的團購', href: '/admin' }, { label: '冰餅團' }]} />
      <SectionNav label="頁面區段" items={[{ label: '內容設定', href: '#content' }, { label: '訂單管理', href: '#orders' }]} />
      <StickyActionBar><button>送出訂單</button></StickyActionBar>
    </>)

    expect(screen.getByRole('banner')).toHaveTextContent('團購小幫手')
    expect(screen.getByRole('navigation', { name: '麵包屑' })).toHaveTextContent('冰餅團')
    expect(screen.getByRole('navigation', { name: '頁面區段' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '主要操作' })).toHaveTextContent('送出訂單')
  })
})
