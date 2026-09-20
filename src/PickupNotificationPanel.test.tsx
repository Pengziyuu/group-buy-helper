import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PickupNotificationPanel from './PickupNotificationPanel'

const preview = {
  previewToken: '92000000-0000-4000-8000-000000000001.ABCD_opaque_snapshot',
  mentionableRecipients: [
    { memberCode: 'member-a', displayName: '王小美', pictureUrl: null, period: 1, unit: 'A1', paid: false },
    { memberCode: 'member-b', displayName: 'Lena', pictureUrl: null, period: 3, unit: '2C3', paid: true },
  ],
  unavailableRecipients: [
    { memberCode: 'member-c', displayName: '不在群組', pictureUrl: null, period: 3, unit: '3Z15', paid: false },
  ],
  mentionableCount: 2,
  messageCount: 1,
}

const command = {
  status: 'awaiting_group_command' as const,
  command: '發送領取通知 P-AbCdEfGhIjKlMnOpQrStUv',
  expiresAt: '2026-09-21T00:10:00.000Z',
  mentionableCount: 2,
  messageCount: 1,
}

const baseProps = {
  campaignId: 'campaign-1',
  campaignTitle: '神農包子',
  campaignStatus: 'closed' as const,
  onPreview: vi.fn(),
  onCreateCommand: vi.fn(),
}

describe('pickup notification panel', () => {
  it('is hidden before closing and offers two audience previews after closing', () => {
    const props = { ...baseProps, campaignStatus: 'open' as const }
    const { rerender } = render(<PickupNotificationPanel {...props} />)
    expect(screen.queryByRole('heading', { name: 'LINE領取通知' })).not.toBeInTheDocument()
    rerender(<PickupNotificationPanel {...baseProps} />)
    expect(screen.getByRole('button', { name: '預覽一期、三期通知' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '預覽二期通知' })).toBeEnabled()
  })

  it('locks test mode to a test command and keeps the test prefix out of the editable body', async () => {
    const user = userEvent.setup()
    const onPreview = vi.fn().mockResolvedValue(preview)
    const onCreateCommand = vi.fn().mockResolvedValue({ ...command, command: '測試領取通知 T-AbCdEfGhIjKlMnOpQrStUv' })
    render(<PickupNotificationPanel {...baseProps} campaignTitle="測試包子團" mode="test" onPreview={onPreview} onCreateCommand={onCreateCommand} />)

    expect(screen.getByText('發送方式：複製一次性測試指令並貼到測試群組')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '預覽測試包子團二期測試通知' }))
    expect(onPreview).toHaveBeenCalledWith('phase2', expect.stringMatching(/^【測試】/))
    const message = await screen.findByRole('textbox', { name: '測試通知正文' })
    expect(message).toHaveAttribute('maxlength', '4495')
    await user.clear(message)
    await user.type(message, '新版功能測試')
    await user.click(screen.getByRole('button', { name: '產生測試群組指令並＠2位住戶' }))
    expect(onCreateCommand).toHaveBeenCalledWith('phase2', '【測試】\n新版功能測試', preview.previewToken)
  })

  it('traps focus in the modal and restores trigger focus on Escape', async () => {
    const user = userEvent.setup()
    render(<PickupNotificationPanel {...baseProps} onPreview={vi.fn().mockResolvedValue(preview)} />)
    const trigger = screen.getByRole('button', { name: '預覽二期通知' })
    await user.click(trigger)
    expect(await screen.findByRole('dialog', { name: '二期領取通知' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '關閉領取通知' })).toHaveFocus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(screen.getByRole('button', { name: '產生正式群組指令並＠2位住戶' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('explains when no current group member can be mentioned', async () => {
    const user = userEvent.setup()
    render(<PickupNotificationPanel {...baseProps} onPreview={vi.fn().mockResolvedValue({ ...preview, previewToken: null, mentionableRecipients: [], mentionableCount: 0, messageCount: 0 })} />)
    await user.click(screen.getByRole('button', { name: '預覽一期、三期通知' }))
    expect(await screen.findByText('目前沒有符合條件且仍在群組中的購買者，因此不能產生指令。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '產生正式群組指令並＠0位住戶' })).toBeDisabled()
  })

  it('keeps preview editable and returns focus after command creation failure', async () => {
    const user = userEvent.setup()
    const onCreateCommand = vi.fn().mockRejectedValue(new Error('暫時無法產生指令'))
    render(<PickupNotificationPanel {...baseProps} onPreview={vi.fn().mockResolvedValue(preview)} onCreateCommand={onCreateCommand} />)
    await user.click(screen.getByRole('button', { name: '預覽二期通知' }))
    const commandButton = await screen.findByRole('button', { name: '產生正式群組指令並＠2位住戶' })
    await user.click(commandButton)
    expect(await screen.findByRole('alert')).toHaveTextContent('暫時無法產生指令')
    expect(screen.getByRole('textbox', { name: '通知內容' })).toBeEnabled()
    expect(commandButton).toHaveFocus()
  })

  it('creates one command, offers copy and never claims notification was sent', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const onCreateCommand = vi.fn().mockResolvedValue(command)
    render(<PickupNotificationPanel {...baseProps} onPreview={vi.fn().mockResolvedValue(preview)} onCreateCommand={onCreateCommand} />)

    await user.click(screen.getByRole('button', { name: '預覽一期、三期通知' }))
    expect(screen.getByText('一期・A1・王小美')).toBeInTheDocument()
    expect(screen.getByText('以下1位目前無法＠')).toBeInTheDocument()
    const message = screen.getByRole('textbox', { name: '通知內容' })
    await user.clear(message)
    await user.type(message, '新的領取通知')
    await user.click(screen.getByRole('button', { name: '產生正式群組指令並＠2位住戶' }))

    expect(onCreateCommand).toHaveBeenCalledWith('phase13', '新的領取通知', preview.previewToken)
    expect(await screen.findByDisplayValue(command.command)).toBeInTheDocument()
    expect(screen.getByText(/此頁尚未代表通知已發送。/)).toBeInTheDocument()
    expect(screen.queryByText('LINE領取通知已發送。')).not.toBeInTheDocument()
    const copy = screen.getByRole('button', { name: '複製指令' })
    expect(copy).toHaveFocus()
    await user.click(copy)
    expect(writeText).toHaveBeenCalledWith(command.command)
    expect(screen.getByText('指令已複製，等待您貼到正式社區群組。')).toBeInTheDocument()
  })

  it('keeps a selectable command when clipboard permission fails', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    render(<PickupNotificationPanel {...baseProps} onPreview={vi.fn().mockResolvedValue(preview)} onCreateCommand={vi.fn().mockResolvedValue(command)} />)
    await user.click(screen.getByRole('button', { name: '預覽二期通知' }))
    await user.click(screen.getByRole('button', { name: '產生正式群組指令並＠2位住戶' }))
    await user.click(await screen.findByRole('button', { name: '複製指令' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('無法自動複製，請手動選取指令複製。')
    expect(screen.getByDisplayValue(command.command)).toBeInTheDocument()
  })

  it('warns only when non-resident buyers are excluded', () => {
    const { rerender } = render(<PickupNotificationPanel {...baseProps} excludedOtherCount={2} />)
    expect(screen.getByText('本團另有 2 位「其他」身分的訂購者不會收到通知，請自行聯繫。')).toBeInTheDocument()
    rerender(<PickupNotificationPanel {...baseProps} excludedOtherCount={0} />)
    expect(screen.queryByText(/不會收到通知/)).not.toBeInTheDocument()
  })
})
