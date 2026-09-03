import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PickupNotificationPanel from './PickupNotificationPanel'

const preview = {
  sent: false,
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

describe('pickup notification panel', () => {
  it('is hidden before closing and offers two audience actions after closing', () => {
    const props = { campaignId: 'campaign-1', campaignTitle: '神農包子', onPreview: vi.fn(), onSend: vi.fn() }
    const { rerender } = render(<PickupNotificationPanel {...props} campaignStatus="open" />)
    expect(screen.queryByRole('heading', { name: 'LINE領取通知' })).not.toBeInTheDocument()

    rerender(<PickupNotificationPanel {...props} campaignStatus="closed" />)
    expect(screen.getByRole('button', { name: '預覽一期、三期通知' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '預覽二期通知' })).toBeEnabled()
  })

  it('locks test mode to the test group and adds an immutable test prefix', async () => {
    const user = userEvent.setup()
    const onPreview = vi.fn().mockResolvedValue(preview)
    const onSend = vi.fn().mockResolvedValue({ ...preview, sent: true })
    render(
      <PickupNotificationPanel
        campaignId="campaign-1"
        campaignTitle="測試包子團"
        campaignStatus="closed"
        mode="test"
        onPreview={onPreview}
        onSend={onSend}
      />,
    )

    expect(screen.getByText('發送目的地：測試群組')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '預覽測試包子團二期測試通知' }))
    expect(onPreview).toHaveBeenCalledWith('phase2', expect.stringMatching(/^【測試】/))
    const message = await screen.findByRole('textbox', { name: '測試通知正文' })
    await user.clear(message)
    await user.type(message, '新版功能測試')
    await user.click(screen.getByRole('button', { name: '確認發送測試通知並＠2位住戶' }))
    expect(onSend).toHaveBeenCalledWith('phase2', '【測試】\n新版功能測試', preview.previewToken)
  })

  it('reserves prefix space in the test message length limit', async () => {
    const user = userEvent.setup()
    render(
      <PickupNotificationPanel
        campaignId="campaign-1"
        campaignTitle="測試包子團"
        campaignStatus="closed"
        mode="test"
        onPreview={vi.fn().mockResolvedValue(preview)}
        onSend={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '預覽測試包子團二期測試通知' }))
    expect(await screen.findByRole('textbox', { name: '測試通知正文' })).toHaveAttribute('maxlength', '4495')
  })

  it('traps focus in the modal, closes with Escape and restores the trigger focus', async () => {
    const user = userEvent.setup()
    const triggerLabel = '預覽二期通知'
    render(
      <PickupNotificationPanel
        campaignId="campaign-1"
        campaignTitle="神農包子"
        campaignStatus="closed"
        onPreview={vi.fn().mockResolvedValue(preview)}
        onSend={vi.fn()}
      />,
    )
    const trigger = screen.getByRole('button', { name: triggerLabel })
    await user.click(trigger)
    expect(await screen.findByRole('dialog', { name: '二期領取通知' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '關閉領取通知' })).toHaveFocus()
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(screen.getByRole('button', { name: '確認發送並＠2位住戶' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: '關閉領取通知' })).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('explains when no matching group member can be mentioned', async () => {
    const user = userEvent.setup()
    render(
      <PickupNotificationPanel
        campaignId="campaign-1"
        campaignTitle="神農包子"
        campaignStatus="closed"
        onPreview={vi.fn().mockResolvedValue({ ...preview, previewToken: null, mentionableRecipients: [], mentionableCount: 0, messageCount: 0 })}
        onSend={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: '預覽一期、三期通知' }))
    expect(await screen.findByText('目前沒有符合條件且仍在群組中的購買者，因此不能發送。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '確認發送並＠0位住戶' })).toBeDisabled()
  })

  it('returns focus to the send action after an asynchronous failure', async () => {
    const user = userEvent.setup()
    let rejectSend: ((reason: Error) => void) | undefined
    const onSend = vi.fn().mockImplementation(() => new Promise<typeof preview>((_resolve, reject) => { rejectSend = reject }))
    render(
      <PickupNotificationPanel
        campaignId="campaign-1"
        campaignTitle="神農包子"
        campaignStatus="closed"
        onPreview={vi.fn().mockResolvedValue(preview)}
        onSend={onSend}
      />,
    )
    await user.click(screen.getByRole('button', { name: '預覽二期通知' }))
    const sendButton = await screen.findByRole('button', { name: '確認發送並＠2位住戶' })
    await user.click(sendButton)
    expect(screen.getByRole('dialog')).toHaveFocus()
    rejectSend?.(new Error('暫時無法發送'))
    expect(await screen.findByRole('alert')).toHaveTextContent('暫時無法發送')
    expect(sendButton).toHaveFocus()
  })

  it('previews recipients, keeps unavailable residents visible and sends the edited message once', async () => {
    const user = userEvent.setup()
    const onPreview = vi.fn().mockResolvedValue(preview)
    let resolveSend: ((value: typeof preview) => void) | undefined
    const onSend = vi.fn().mockImplementation(() => new Promise<typeof preview>((resolve) => { resolveSend = resolve }))
    render(
      <PickupNotificationPanel
        campaignId="campaign-1"
        campaignTitle="神農包子"
        campaignStatus="closed"
        onPreview={onPreview}
        onSend={onSend}
      />,
    )

    await user.click(screen.getByRole('button', { name: '預覽一期、三期通知' }))
    expect(onPreview).toHaveBeenCalledWith('phase13', expect.stringContaining('一期、三期芳鄰【神農包子】'))
    expect(screen.getByRole('dialog', { name: '一期、三期領取通知' })).toBeInTheDocument()
    expect(screen.getByText('一期・A1・王小美')).toBeInTheDocument()
    expect(screen.getByText('三期・2C3・Lena')).toBeInTheDocument()
    expect(screen.getByText('三期・3Z15・不在群組')).toBeInTheDocument()
    expect(screen.getByText('以下1位目前無法＠')).toBeInTheDocument()

    const message = screen.getByRole('textbox', { name: '通知內容' })
    await user.clear(message)
    await user.type(message, '新的領取通知')
    await user.click(screen.getByRole('button', { name: '確認發送並＠2位住戶' }))

    expect(onSend).toHaveBeenCalledWith('phase13', '新的領取通知', preview.previewToken)
    expect(screen.getByRole('button', { name: '發送中…' })).toBeDisabled()
    expect(screen.getByRole('dialog', { name: '一期、三期領取通知' })).toHaveFocus()
    expect(onSend).toHaveBeenCalledTimes(1)
    resolveSend?.({ ...preview, sent: true })
    expect(await screen.findByText('LINE領取通知已發送。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '關閉' })).toHaveFocus()
  })
})
