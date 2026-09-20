import { describe, expect, it, vi } from 'vitest'
import { createPickupNotificationGateway } from './pickupNotificationGateway'

const preview = {
  previewToken: '92000000-0000-4000-8000-000000000001.ABCD_opaque_snapshot',
  mentionableRecipients: [{
    memberCode: 'member-a', displayName: '住戶A', pictureUrl: null, period: 1, unit: 'A1', paid: false,
  }],
  unavailableRecipients: [],
  mentionableCount: 1,
  messageCount: 1,
}

const command = {
  status: 'awaiting_group_command' as const,
  command: '發送領取通知 P-AbCdEfGhIjKlMnOpQrStUv',
  expiresAt: '2026-09-21T00:10:00.000Z',
  mentionableCount: 1,
  messageCount: 1,
}

describe('pickup notification gateway', () => {
  it('previews then creates a one-time group command without a send action', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: preview, error: null })
    const gateway = createPickupNotificationGateway({ functions: { invoke } } as never)

    await expect(gateway.preview('00000000-0000-4000-8000-000000000123', 'phase13', '領取通知')).resolves.toEqual(preview)
    expect(invoke).toHaveBeenLastCalledWith('send-pickup-notification', {
      body: { action: 'preview', campaignId: '00000000-0000-4000-8000-000000000123', audience: 'phase13', message: '領取通知' },
    })

    invoke.mockResolvedValueOnce({ data: command, error: null })
    await expect(gateway.createCommand('00000000-0000-4000-8000-000000000123', 'phase2', '二期通知', preview.previewToken)).resolves.toEqual(command)
    expect(invoke).toHaveBeenLastCalledWith('send-pickup-notification', {
      body: { action: 'create-command', campaignId: '00000000-0000-4000-8000-000000000123', audience: 'phase2', message: '二期通知', previewToken: preview.previewToken },
    })
    expect(invoke).not.toHaveBeenCalledWith('send-pickup-notification', { body: expect.objectContaining({ action: 'send' }) })
  })

  it('fixes a test gateway to the test destination for every request', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: preview, error: null })
    const gateway = createPickupNotificationGateway({ functions: { invoke } } as never, 'test')

    await gateway.preview('00000000-0000-4000-8000-000000000123', 'phase2', '【測試】通知')
    expect(invoke).toHaveBeenCalledWith('send-test-pickup-notification', {
      body: { action: 'preview', campaignId: '00000000-0000-4000-8000-000000000123', audience: 'phase2', message: '【測試】通知' },
    })
  })

  it('rejects old sent acknowledgements and malformed or sensitive command responses', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { ...preview, sent: true }, error: null })
    const gateway = createPickupNotificationGateway({ functions: { invoke } } as never)
    await expect(gateway.createCommand('00000000-0000-4000-8000-000000000123', 'phase13', '通知', preview.previewToken)).rejects.toThrow('LINE通知回傳格式錯誤')

    invoke.mockResolvedValueOnce({ data: { ...command, lineUserIds: ['secret'] }, error: null })
    await expect(gateway.createCommand('00000000-0000-4000-8000-000000000123', 'phase13', '通知', preview.previewToken)).rejects.toThrow('LINE通知回傳格式錯誤')
  })

  it('rejects malformed preview recipient data', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { ...preview, mentionableRecipients: [{ lineUserId: 'secret' }] }, error: null })
    const gateway = createPickupNotificationGateway({ functions: { invoke } } as never)
    await expect(gateway.preview('00000000-0000-4000-8000-000000000123', 'phase13', '通知')).rejects.toThrow('LINE通知回傳格式錯誤')
  })

  it('rejects a command prefix for the opposite destination', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ...command, command: '測試領取通知 T-AbCdEfGhIjKlMnOpQrStUv' },
      error: null,
    })
    const gateway = createPickupNotificationGateway({ functions: { invoke } } as never, 'production')
    await expect(gateway.createCommand(
      '00000000-0000-4000-8000-000000000123', 'phase13', '通知', preview.previewToken,
    )).rejects.toThrow('LINE通知回傳格式錯誤')
  })
})
