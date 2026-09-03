import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import NotificationTestLab from './NotificationTestLab'
import type { CampaignListItem } from './services/campaignManagementGateway'

const campaigns: CampaignListItem[] = [
  { id: 'test-id', slug: 'test-slug', title: '既有測試團', status: 'closed', openedAt: '2026-09-01T00:00:00Z', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
  { id: 'candidate-id', slug: 'candidate-slug', title: '候選團', status: 'arrived', openedAt: '2026-09-01T00:00:00Z', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
  { id: 'open-id', slug: 'open-slug', title: '進行中團', status: 'open', openedAt: '2026-09-01T00:00:00Z', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
]

describe('notification test lab', () => {
  it('separates test delivery and requires explicit campaign classification', async () => {
    const user = userEvent.setup()
    const onSetTestCampaign = vi.fn().mockResolvedValue(undefined)
    render(
      <NotificationTestLab
        campaigns={campaigns}
        testCampaignIds={['test-id']}
        onSetTestCampaign={onSetTestCampaign}
        onPreview={vi.fn()}
        onSend={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: '通知測試中心' })).toBeInTheDocument()
    expect(screen.getByText('此頁所有通知只會送往測試群組')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '預覽既有測試團二期測試通知' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '將候選團加入通知測試中心' })).toBeInTheDocument()
    expect(screen.queryByText('進行中團')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '將候選團加入通知測試中心' }))
    expect(onSetTestCampaign).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '加入通知測試中心' })).toHaveTextContent('候選團')
    await user.click(screen.getByRole('button', { name: '確認加入測試中心' }))
    await waitFor(() => expect(onSetTestCampaign).toHaveBeenCalledWith('candidate-id', true))
    expect(screen.getAllByText('發送目的地：測試群組')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: '將候選團移出通知測試中心' }))
    expect(screen.getByRole('dialog', { name: '移出通知測試中心' })).toHaveTextContent('候選團')
    await user.click(screen.getByRole('button', { name: '確認移出測試中心' }))
    await waitFor(() => expect(onSetTestCampaign).toHaveBeenLastCalledWith('candidate-id', false))
    expect(screen.getAllByText('發送目的地：測試群組')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '將候選團加入通知測試中心' })).toBeInTheDocument()
  })

  it('qualifies controls by campaign when multiple test campaigns are shown', () => {
    render(
      <NotificationTestLab
        campaigns={campaigns}
        testCampaignIds={['test-id', 'candidate-id']}
        onSetTestCampaign={vi.fn()}
        onPreview={vi.fn()}
        onSend={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '預覽既有測試團二期測試通知' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '預覽候選團二期測試通知' })).toBeInTheDocument()
  })
})
