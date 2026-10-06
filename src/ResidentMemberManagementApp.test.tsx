import { render, screen, within } from '@testing-library/react'
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

const unboundMember = {
  memberCode: '1111111111111111111111111111111111aa',
  displayName: '住戶丁',
  pictureUrl: null,
  period: null,
  unit: null,
  joinedAt: '2026-08-16T00:00:00Z',
  blocked: false,
  blockedAt: null,
}

describe('ResidentMemberManagementApp', () => {
  it('shows the latest active check beside the refresh button and keeps cards compact', () => {
    render(<ResidentMemberManagementApp members={[
      { ...members[0], groupStatus: 'in_group', groupCheckedAt: '2026-09-20T18:35:00Z' },
      { ...otherMember, groupStatus: 'not_in_group', groupCheckedAt: '2026-09-21T18:35:00Z' },
      { ...members[1], groupStatus: 'in_group', groupCheckedAt: '2026-09-22T18:35:00Z' },
    ]} onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()} onRefreshGroupStatuses={vi.fn()} />)

    const summary = screen.getByRole('region', { name: 'LINE 群組查驗' })
    const checkedTime = within(summary).getByTitle('2026/09/22 02:35')
    expect(checkedTime).toHaveAttribute('datetime', '2026-09-21T18:35:00Z')
    expect(checkedTime.closest('.resident-group-check-actions')).toContainElement(screen.getByRole('button', { name: '更新全部群組狀態' }))
    expect(within(screen.getByRole('article', { name: '住戶甲' })).queryByText(/查驗/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '住戶丙' })).queryByText(/查驗/)).not.toBeInTheDocument()
  })

  it('shows an empty check hint when no active resident has been checked', () => {
    render(<ResidentMemberManagementApp members={[{ ...members[0], groupStatus: 'unchecked', groupCheckedAt: null }]}
      onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()} onRefreshGroupStatuses={vi.fn()} />)
    expect(screen.getByText('尚無查驗紀錄')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '住戶甲' })).getByText('尚未查驗')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '住戶甲' })).queryByText(/最後查驗/)).not.toBeInTheDocument()
  })

  it('checks every active resident with one button and summarises the result with lights', async () => {
    const user = userEvent.setup()
    const active = [
      { ...members[0], groupStatus: 'in_group' as const, groupCheckedAt: '2026-09-20T01:00:00Z' },
      { ...otherMember, groupStatus: 'unchecked' as const, groupCheckedAt: null },
    ]
    const onRefreshGroupStatuses = vi.fn().mockResolvedValue([
      { memberCode: members[0].memberCode, groupStatus: 'in_group', groupCheckedAt: '2026-09-24T01:00:00Z' },
      { memberCode: otherMember.memberCode, groupStatus: 'not_in_group', groupCheckedAt: '2026-09-24T01:00:00Z' },
    ])
    render(<ResidentMemberManagementApp members={[...active, members[1]]} onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()}
      onRefreshGroupStatuses={onRefreshGroupStatuses} />)

    const summary = screen.getByRole('list', { name: '正式群組狀態' })
    // A count of 0 is left out.
    expect(within(summary).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['在群組內 1', '尚未查驗 1'])
    expect(screen.queryByRole('button', { name: /更新住戶甲的群組狀態/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'LINE 群組查驗' })).getByTitle('2026/09/20 09:00')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '住戶丙' })).queryByText(/最後查驗/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '更新全部群組狀態' }))
    expect(onRefreshGroupStatuses).toHaveBeenCalledOnce()
    expect(onRefreshGroupStatuses).toHaveBeenCalledWith([members[0].memberCode, otherMember.memberCode])
    expect(await screen.findByText('已更新 2 位住戶的群組狀態')).toBeInTheDocument()
    expect(within(summary).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['在群組內 1', '不在群組 1'])
    expect(within(screen.getByRole('region', { name: 'LINE 群組查驗' })).getByTitle('2026/09/24 09:00')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '住戶甲' })).queryByText(/查驗/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '住戶丙' })).queryByText(/查驗/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '住戶丙' })).getByText('不在群組')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '陌生住戶' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '已封鎖 1' }))
    expect(within(screen.getByRole('article', { name: '陌生住戶' })).queryByText(/群組/)).not.toBeInTheDocument()
    expect(screen.getByText(/僅供核對/)).toHaveAttribute('title', '群組狀態僅供核對，不會自動停用既有住戶。')
  })

  it('keeps each card to a name line and one line of household and join date, marking only residents not in the group', () => {
    render(<ResidentMemberManagementApp members={[
      { ...members[0], groupStatus: 'in_group', groupCheckedAt: '2026-09-20T18:35:00Z' },
      { ...otherMember, groupStatus: 'not_in_group', groupCheckedAt: '2026-09-21T18:35:00Z' },
      { ...unboundMember, groupStatus: 'unknown', groupCheckedAt: '2026-09-21T18:35:00Z' },
    ]} onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()} onRefreshGroupStatuses={vi.fn()} />)

    const inGroup = screen.getByRole('article', { name: '住戶甲' })
    // Nearly everyone is in the group, so saying so on every card says nothing.
    expect(within(inGroup).queryByText(/群組/)).not.toBeInTheDocument()
    expect(inGroup.querySelector('.resident-member-meta')).toHaveTextContent(/^二期 2K13・.+加入$/)
    expect(within(screen.getByRole('article', { name: '住戶丙' })).getByText('不在群組')).toHaveAttribute('data-tone', 'danger')
    expect(within(screen.getByRole('article', { name: '住戶丁' })).getByText('無法確認')).toHaveAttribute('data-tone', 'neutral')
  })

  it('lists only the residents behind a group count when it is clicked, and everyone again on a second click', async () => {
    const user = userEvent.setup()
    render(<ResidentMemberManagementApp members={[
      { ...members[0], groupStatus: 'in_group', groupCheckedAt: '2026-09-20T18:35:00Z' },
      { ...otherMember, groupStatus: 'not_in_group', groupCheckedAt: '2026-09-21T18:35:00Z' },
      { ...unboundMember, groupStatus: 'unchecked', groupCheckedAt: null },
    ]} onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()} onRefreshGroupStatuses={vi.fn()} />)

    const shown = () => screen.getAllByRole('article').map((card) => within(card).getByRole('heading').textContent)
    const notInGroup = screen.getByRole('button', { name: '只看不在群組 1' })
    expect(notInGroup).toHaveAttribute('aria-pressed', 'false')
    await user.click(notInGroup)
    expect(notInGroup).toHaveAttribute('aria-pressed', 'true')
    expect(shown()).toEqual(['住戶丙'])

    await user.click(screen.getByRole('button', { name: '只看尚未查驗 1' }))
    expect(shown()).toEqual(['住戶丁'])
    await user.click(screen.getByRole('button', { name: '只看尚未查驗 1' }))
    expect(shown()).toEqual(['住戶甲', '住戶丙', '住戶丁'])

    // Picking one of the filters above replaces the group count filter.
    await user.click(screen.getByRole('button', { name: '只看不在群組 1' }))
    await user.click(screen.getByRole('radio', { name: '未填戶號 1' }))
    expect(screen.getByRole('button', { name: '只看不在群組 1' })).toHaveAttribute('aria-pressed', 'false')
    expect(shown()).toEqual(['住戶丁'])
  })

  it('checks residents in batches of 20 and keeps old results for a batch that fails', async () => {
    const user = userEvent.setup()
    const many = Array.from({ length: 45 }, (_, index) => ({
      ...otherMember,
      memberCode: index.toString(16).padStart(36, '0'),
      displayName: `住戶${index + 1}`,
      groupStatus: 'unchecked' as const,
      groupCheckedAt: null,
    }))
    const onRefreshGroupStatuses = vi.fn(async (codes: string[]) => {
      if (codes.includes(many[20].memberCode)) throw new Error('群組查驗失敗')
      return codes.map((memberCode) => ({ memberCode, groupStatus: 'in_group' as const, groupCheckedAt: '2026-09-24T01:00:00Z' }))
    })
    render(<ResidentMemberManagementApp members={many} onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()}
      onRefreshGroupStatuses={onRefreshGroupStatuses} />)

    await user.click(screen.getByRole('button', { name: '更新全部群組狀態' }))
    expect(await screen.findByText('20 位暫時無法確認，原本的結果未變更，請稍後再試')).toBeInTheDocument()
    expect(onRefreshGroupStatuses.mock.calls.map(([codes]) => codes.length)).toEqual([20, 20, 5])
    const summary = screen.getByRole('list', { name: '正式群組狀態' })
    expect(within(summary).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['在群組內 25', '尚未查驗 20'])
    expect(within(screen.getByRole('region', { name: 'LINE 群組查驗' })).getByTitle('2026/09/24 09:00')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: '住戶1' })).queryByText(/最後查驗/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '更新全部群組狀態' })).toBeEnabled()
  })

  it('shows verified LINE residents without internal identity fields', async () => {
    const user = userEvent.setup()
    render(<ResidentMemberManagementApp members={members} onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 1, name: '住戶 1 位' })).toBeInTheDocument()
    // Desktop cards cut a long name to one line, so the full name rides on the hover title.
    expect(screen.getByText('住戶甲')).toHaveAttribute('title', '住戶甲')
    expect(screen.getByText('二期 2K13')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '住戶甲的 LINE 頭貼' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('abcdef0123456789abcdef0123456789abcd')
    expect(screen.getByRole('button', { name: '調整住戶資料 住戶甲' })).toHaveTextContent('調整戶號')
    await user.click(screen.getByRole('button', { name: '更多操作 住戶甲' }))
    expect(screen.getByRole('menuitem', { name: '移除並封鎖 住戶甲' })).toHaveAttribute('data-tone', 'danger')
    await user.keyboard('{Escape}')

    expect(screen.queryByText('陌生住戶')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '已封鎖 1' }))
    expect(screen.getByText('陌生住戶')).toBeInTheDocument()
    expect(screen.getByText('已封鎖', { selector: '.ui-status-badge' })).toBeInTheDocument()
  })


  it('requires confirmation before removing and blocking a resident', async () => {
    const user = userEvent.setup()
    const onSetBlocked = vi.fn().mockResolvedValue(undefined)
    render(<ResidentMemberManagementApp members={members} onSetBlocked={onSetBlocked} onUpdateHousehold={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '更多操作 住戶甲' }))
    await user.click(screen.getByRole('menuitem', { name: '移除並封鎖 住戶甲' }))
    expect(screen.getByRole('dialog', { name: '確認移除住戶' })).toBeInTheDocument()
    expect(onSetBlocked).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '確認移除並封鎖' }))
    expect(onSetBlocked).toHaveBeenCalledWith('abcdef0123456789abcdef0123456789abcd', true)
    expect(await screen.findByText('已移除並封鎖住戶甲')).toBeInTheDocument()
  })

  it('lets the organizer unblock a resident', async () => {
    const user = userEvent.setup()
    const onSetBlocked = vi.fn().mockResolvedValue(undefined)
    render(<ResidentMemberManagementApp members={members} initialFilter="blocked" onSetBlocked={onSetBlocked} onUpdateHousehold={vi.fn()} />)

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

    expect(within(screen.getByRole('article', { name: '住戶丙' })).getByText('其他')).toBeInTheDocument()
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
    expect(within(screen.getByRole('article', { name: '住戶甲' })).getByText('其他')).toBeInTheDocument()
  })

  it('filters residents and searches by name or household', async () => {
    const user = userEvent.setup()
    render(<ResidentMemberManagementApp members={[...members, otherMember, unboundMember]} onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 1, name: '住戶 3 位' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '全部 3' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '未填戶號 1' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '其他 1' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '已封鎖 1' })).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: '搜尋住戶' }), '2k13')
    expect(screen.getByRole('article', { name: '住戶甲' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '住戶丙' })).not.toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: '搜尋住戶' }))
    await user.click(screen.getByRole('radio', { name: '未填戶號 1' }))
    const unboundCard = screen.getByRole('article', { name: '住戶丁' })
    expect(within(unboundCard).getByText('尚未填戶號')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '住戶甲' })).not.toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: '搜尋住戶' }), '不存在')
    expect(screen.getByText('沒有符合條件的住戶。')).toBeInTheDocument()
  })

  it('opens on the filter it was linked with', () => {
    render(<ResidentMemberManagementApp members={[...members, unboundMember]} initialFilter="unbound" onSetBlocked={vi.fn()} onUpdateHousehold={vi.fn()} />)
    expect(screen.getByRole('radio', { name: '未填戶號 1' })).toBeChecked()
    expect(screen.getByRole('article', { name: '住戶丁' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: '住戶甲' })).not.toBeInTheDocument()
  })
})
