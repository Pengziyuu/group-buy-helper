import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ResidentMemberManagementApp from './ResidentMemberManagementApp'

const members = [{
  memberCode: 'abcdef0123456789abcdef0123456789abcd',
  displayName: '住戶甲',
  pictureUrl: 'https://example.com/avatar.jpg',
  period: 2,
  unit: '2K13',
  joinedAt: '2026-08-14T00:00:00Z',
  blocked: false,
  blockedAt: null,
}, {
  memberCode: '0123456789abcdef0123456789abcdef0123',
  displayName: '陌生住戶',
  pictureUrl: null,
  period: null,
  unit: null,
  joinedAt: '2026-08-13T00:00:00Z',
  blocked: true,
  blockedAt: '2026-08-14T01:00:00Z',
}]

describe('ResidentMemberManagementApp', () => {
  it('shows verified LINE residents without internal identity fields', () => {
    render(<ResidentMemberManagementApp members={members} onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '住戶管理' })).toBeInTheDocument()
    expect(screen.getByText('住戶甲')).toBeInTheDocument()
    expect(screen.getByText('二期・2K13')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '住戶甲的LINE頭貼' })).toBeInTheDocument()
    expect(screen.getByText('陌生住戶')).toBeInTheDocument()
    expect(screen.getByText('已封鎖')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('abcdef0123456789abcdef0123456789abcd')
    const adjustButton = screen.getByRole('button', { name: '調整住戶資料 住戶甲' })
    const blockButton = screen.getByRole('button', { name: '移除並封鎖 住戶甲' })
    expect(adjustButton).toHaveClass('resident-action-secondary')
    expect(blockButton).toHaveClass('resident-action-danger')
    expect(adjustButton.querySelector('[aria-hidden="true"]')).toHaveTextContent('✎')
    expect(blockButton.querySelector('[aria-hidden="true"]')).toHaveTextContent('⊘')
  })

  it('requires confirmation before removing and blocking a resident', async () => {
    const user = userEvent.setup()
    const onSetBlocked = vi.fn().mockResolvedValue(undefined)
    render(<ResidentMemberManagementApp members={members} onSetBlocked={onSetBlocked} onUpdateHousehold={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '移除並封鎖 住戶甲' }))
    expect(screen.getByRole('dialog', { name: '確認移除住戶' })).toBeInTheDocument()
    expect(onSetBlocked).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '確認移除並封鎖' }))
    expect(onSetBlocked).toHaveBeenCalledWith('abcdef0123456789abcdef0123456789abcd', true)
    expect(await screen.findByText('已移除並封鎖住戶甲')).toBeInTheDocument()
  })

  it('lets the organizer unblock a resident', async () => {
    const user = userEvent.setup()
    const onSetBlocked = vi.fn().mockResolvedValue(undefined)
    render(<ResidentMemberManagementApp members={members} onSetBlocked={onSetBlocked} onUpdateHousehold={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '解除封鎖 陌生住戶' }))

    expect(onSetBlocked).toHaveBeenCalledWith('0123456789abcdef0123456789abcdef0123', false)
    expect(await screen.findByText('已解除陌生住戶的封鎖')).toBeInTheDocument()
  })

  it('lets the organizer adjust a resident period and household from complete options', async () => {
    const user = userEvent.setup()
    const onUpdateHousehold = vi.fn().mockResolvedValue(undefined)
    render(
      <ResidentMemberManagementApp
        members={members}
        onSetBlocked={vi.fn()}
        onUpdateHousehold={onUpdateHousehold}
      />,
    )

    await user.click(screen.getByRole('button', { name: '調整住戶資料 住戶甲' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '住戶甲 期別' }), '3')
    await user.selectOptions(screen.getByRole('combobox', { name: '住戶甲 前段' }), '3')
    await user.selectOptions(screen.getByRole('combobox', { name: '住戶甲 棟別' }), 'Z')
    await user.selectOptions(screen.getByRole('combobox', { name: '住戶甲 號碼' }), '15')
    await user.click(screen.getByRole('button', { name: '儲存住戶資料 住戶甲' }))

    expect(onUpdateHousehold).toHaveBeenCalledWith(
      'abcdef0123456789abcdef0123456789abcd',
      { period: 3, unit: '3Z15' },
    )
    expect(await screen.findByText('已更新住戶甲的期別／戶號')).toBeInTheDocument()
    expect(screen.getByText('三期・3Z15')).toBeInTheDocument()
  })
})
