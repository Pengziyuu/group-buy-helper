import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContentSectionNav } from './ContentSectionNav'
import { ContentTopBar } from './ContentTopBar'
import { PublishChecklist } from './PublishChecklist'

const topBar = {
  saveState: { tone: 'idle' as const, text: '已自動儲存 14:05' },
  retryDisabled: false,
  publication: 'current' as const,
  residentHref: '/campaign/abc',
  primaryLabel: '更新住戶頁',
  publishing: false,
  publishDisabledReason: null,
  onPublish: vi.fn(),
  notice: null,
}

describe('ContentTopBar', () => {
  it('shows the save state, the publication state, the resident page link and the publish button', async () => {
    const user = userEvent.setup()
    const onPublish = vi.fn()
    render(<ContentTopBar {...topBar} onPublish={onPublish} />)

    expect(screen.getByRole('heading', { level: 2, name: '內容設定' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('已自動儲存 14:05')
    expect(screen.getByText('住戶頁已是最新')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: '預覽住戶頁' })
    expect(link).toHaveAttribute('href', '/campaign/abc')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.queryByRole('button', { name: '重試' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '更新住戶頁' }))
    expect(onPublish).toHaveBeenCalledOnce()
  })

  it('explains why publishing is unavailable and hides the link before the first publication', () => {
    render(<ContentTopBar {...topBar} publication="unpublished" residentHref={null} primaryLabel="發布並開團" publishDisabledReason="還有 2 項需要處理，見「發布前檢查」" />)

    expect(screen.getByText('草稿・住戶還看不到')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '預覽住戶頁' })).not.toBeInTheDocument()
    const publish = screen.getByRole('button', { name: '發布並開團' })
    expect(publish).toBeDisabled()
    expect(publish).toHaveAccessibleDescription('還有 2 項需要處理，見「發布前檢查」')
  })

  it('offers a retry only after a failed save', async () => {
    const user = userEvent.setup()
    const onRetrySave = vi.fn()
    render(<ContentTopBar {...topBar} saveState={{ tone: 'error', text: '儲存失敗：網路中斷' }} onRetrySave={onRetrySave} />)

    expect(screen.getByRole('status')).toHaveTextContent('儲存失敗：網路中斷')
    await user.click(screen.getByRole('button', { name: '重試' }))
    expect(onRetrySave).toHaveBeenCalledOnce()
  })

  it('announces publish results and shows failures as alerts', () => {
    const { rerender } = render(<ContentTopBar {...topBar} notice={{ tone: 'info', text: '住戶頁已更新' }} />)
    expect(screen.getByText('住戶頁已更新')).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    rerender(<ContentTopBar {...topBar} notice={{ tone: 'error', text: '發布失敗：網路中斷' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('發布失敗：網路中斷')
  })
})

describe('ContentSectionNav', () => {
  afterEach(() => { window.history.replaceState(null, '', '/') })

  const completion = { announcement: true, items: false, schedule: true, advanced: true }

  it('marks each section as filled in or unfinished', () => {
    render(<ContentSectionNav completion={completion} />)
    const nav = screen.getByRole('navigation', { name: '內容設定段落' })

    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      '✓公告與圖片（已填妥）',
      '•品項與價格（尚未完成）',
      '✓成團與時程（已填妥）',
      '✓優惠與進階（已填妥）',
    ])
    expect(within(nav).getByRole('link', { name: '品項與價格（尚未完成）' })).toBeInTheDocument()
  })

  it('jumps to a section without changing the address and focuses its heading', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/admin/campaign/campaign-1/content')
    render(
      <>
        <ContentSectionNav completion={completion} />
        <h3 id="content-items-heading" tabIndex={-1}>品項與價格</h3>
      </>,
    )
    const historyLength = window.history.length

    await user.click(screen.getByRole('link', { name: '品項與價格（尚未完成）' }))

    expect(`${window.location.pathname}${window.location.hash}`).toBe('/admin/campaign/campaign-1/content')
    expect(window.history.length).toBe(historyLength)
    expect(screen.getByRole('heading', { name: '品項與價格' })).toHaveFocus()
  })
})

describe('PublishChecklist', () => {
  it('lists what is still missing', () => {
    render(<PublishChecklist blockers={['填寫團購標題', '填寫品項 A 的名稱']} />)
    const checklist = screen.getByRole('region', { name: '發布前檢查' })

    expect(within(checklist).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['填寫團購標題', '填寫品項 A 的名稱'])
  })

  it('says when everything required is done', () => {
    render(<PublishChecklist blockers={[]} />)

    expect(within(screen.getByRole('region', { name: '發布前檢查' })).getByText('必填項目都已完成')).toBeInTheDocument()
  })
})
