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

const otherMember = {
  memberCode: 'fedcba9876543210fedcba9876543210fedc',
  displayName: '住戶丙',
  pictureUrl: null,
  period: null,
  unit: null,
  householdKind: 'other' as const,
  joinedAt: '2026-08-15T00:00:00Z',
  blocked: false,
  blockedAt: null,
}

describe('ResidentMemberManagementApp', () => {
  it('refreshes each LINE account status without changing existing admission or household', async () => {
    const user = userEvent.setup()
    const onRefreshGroupStatuses = vi.fn().mockResolvedValue([{ memberCode: members[0].memberCode, groupStatus: 'not_in_group', groupCheckedAt: '2026-09-23T01:00:00Z' }])
    render(<ResidentMemberManagementApp members={[members[0]]} onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()}
      onRefreshGroupStatuses={onRefreshGroupStatuses} />)
    expect(screen.getByText('尚未查驗')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '更新住戶甲的群組狀態' }))
    expect(onRefreshGroupStatuses).toHaveBeenCalledWith([members[0].memberCode])
    expect(await screen.findByText('不在正式群組內')).toBeInTheDocument()
    expect(screen.getByText('二期 2K13')).toBeInTheDocument()
    expect(screen.getByText(/群組狀態僅供核對/)).toBeInTheDocument()
  })

  it('reports lookup failure without claiming absence or disabling a resident', async () => {
    const user = userEvent.setup()
    const onRefreshGroupStatuses = vi.fn().mockRejectedValue(new Error('群組查驗失敗'))
    render(<ResidentMemberManagementApp members={[members[0]]} onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()}
      onRefreshGroupStatuses={onRefreshGroupStatuses} />)
    await user.click(screen.getByRole('button', { name: '更新住戶甲的群組狀態' }))
    expect(await screen.findByText('群組查驗失敗')).toBeInTheDocument()
    expect(screen.getByText('尚未查驗')).toBeInTheDocument()
  })

  it('shows verified LINE residents without internal identity fields', () => {
    render(<ResidentMemberManagementApp members={members} onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '住戶名單' })).toBeInTheDocument()
    expect(screen.getByText('住戶甲')).toBeInTheDocument()
    expect(screen.getByText('二期 2K13')).toBeInTheDocument()
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
    expect(screen.getByRole('group', { name: '戶號' })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: '住戶甲 戶號數字' }), '3')
    await user.selectOptions(screen.getByRole('combobox', { name: '住戶甲 戶號英文字母' }), 'Z')
    await user.selectOptions(screen.getByRole('combobox', { name: '住戶甲 樓層' }), '15')
    await user.click(screen.getByRole('button', { name: '儲存住戶資料 住戶甲' }))

    expect(onUpdateHousehold).toHaveBeenCalledWith(
      'abcdef0123456789abcdef0123456789abcd',
      { kind: 'resident', period: 3, unit: '3Z15' },
    )
    expect(await screen.findByText('已更新住戶甲的期別／戶號')).toBeInTheDocument()
    expect(screen.getByText('三期 3Z15')).toBeInTheDocument()
  })

  it('lets the organizer repair an other member who was mis-clicked into that kind', async () => {
    const user = userEvent.setup()
    const onUpdateHousehold = vi.fn().mockResolvedValue(undefined)
    render(
      <ResidentMemberManagementApp
        members={[otherMember]}
        onSetBlocked={vi.fn()}
        onUpdateHousehold={onUpdateHousehold}
      />,
    )

    expect(screen.getByText('其他')).toBeInTheDocument()
    const adjustButton = screen.getByRole('button', { name: '調整住戶資料 住戶丙' })
    expect(adjustButton).toBeInTheDocument()

    await user.click(adjustButton)
    await user.selectOptions(screen.getByRole('combobox', { name: '住戶丙 期別' }), '1')
    await user.selectOptions(screen.getByRole('combobox', { name: '住戶丙 戶號英文字母' }), 'A')
    await user.selectOptions(screen.getByRole('combobox', { name: '住戶丙 樓層' }), '1')
    await user.click(screen.getByRole('button', { name: '儲存住戶資料 住戶丙' }))

    expect(onUpdateHousehold).toHaveBeenCalledWith(
      'fedcba9876543210fedcba9876543210fedc',
      { kind: 'resident', period: 1, unit: 'A1' },
    )
    expect(await screen.findByText('已更新住戶丙的期別／戶號')).toBeInTheDocument()
  })

  it('hides the household selects when the organizer picks 其他', async () => {
    const user = userEvent.setup()
    render(
      <ResidentMemberManagementApp
        members={[members[0]]}
        onSetBlocked={vi.fn()}
        onUpdateHousehold={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '調整住戶資料 住戶甲' }))
    expect(screen.getByRole('combobox', { name: '住戶甲 戶號英文字母' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: '住戶甲 期別' }), 'other')

    expect(screen.queryByRole('combobox', { name: '住戶甲 戶號數字' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '住戶甲 戶號英文字母' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '住戶甲 樓層' })).not.toBeInTheDocument()
  })

  it('moves a resident to 其他 with no household at all', async () => {
    const user = userEvent.setup()
    const onUpdateHousehold = vi.fn().mockResolvedValue(undefined)
    render(
      <ResidentMemberManagementApp
        members={[members[0]]}
        onSetBlocked={vi.fn()}
        onUpdateHousehold={onUpdateHousehold}
      />,
    )

    await user.click(screen.getByRole('button', { name: '調整住戶資料 住戶甲' }))
    await user.selectOptions(screen.getByRole('combobox', { name: '住戶甲 期別' }), 'other')
    await user.click(screen.getByRole('button', { name: '儲存住戶資料 住戶甲' }))

    expect(onUpdateHousehold).toHaveBeenCalledWith(
      'abcdef0123456789abcdef0123456789abcd',
      { kind: 'other', period: null, unit: null },
    )
    expect(await screen.findByText('已將住戶甲改為其他')).toBeInTheDocument()
    expect(screen.getByText('其他')).toBeInTheDocument()
  })
})
