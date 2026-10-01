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
  it('shows a bounded over-five warning returned by the backend', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: '需要6則訊息，超過單一指令5則上限；目前無法產生涵蓋全部住戶的指令' })) } })
    const gateway = createPickupNotificationGateway({ functions: { invoke } } as never)
    await expect(gateway.previewPlan('campaign', { mode: 'cold', messages: { phase13: '一三', phase2: '二' } })).rejects.toThrow('需要6則訊息，超過單一指令5則上限；目前無法產生涵蓋全部住戶的指令')
  })
  it('adapts a flat backend preview into mode-specific lists without exposing identities', async () => {
    const second = { ...preview.mentionableRecipients[0], memberCode: 'member-b', period: 2 }
    const flat = { ...preview, mentionableRecipients: [preview.mentionableRecipients[0], second], mentionableCount: 2, messageCount: 2 }
    const gateway = createPickupNotificationGateway({ functions: { invoke: vi.fn().mockResolvedValue({ data: flat, error: null }) } } as never)
    const result = await gateway.previewPlan('campaign', { mode: 'cold', messages: { phase13: '第一則', phase2: '第二則' } })
    expect(result.groups.phase13?.mentionableRecipients.map((item) => item.memberCode)).toEqual(['member-a'])
    expect(result.groups.phase2?.mentionableRecipients.map((item) => item.memberCode)).toEqual(['member-b'])
    expect(result.messageCount).toBe(2)
  })
  it('sends both cold messages in one sealed preview and command request', async () => {
    const plan = { mode: 'cold' as const, messages: { phase13: '一期三期通知', phase2: '二期通知' } }
    const combined = { previewToken: preview.previewToken, messageCount: 2, groups: { phase13: preview, phase2: preview } }
    const invoke = vi.fn().mockResolvedValueOnce({ data: combined, error: null }).mockResolvedValueOnce({ data: { ...command, messageCount: 2 }, error: null })
    const gateway = createPickupNotificationGateway({ functions: { invoke } } as never)
    await expect(gateway.previewPlan('campaign', plan)).resolves.toEqual(combined)
    expect(invoke).toHaveBeenCalledWith('send-pickup-notification', { body: { action: 'preview', campaignId: 'campaign', mode: 'cold', messages: plan.messages } })
    await gateway.createPlanCommand('campaign', plan, preview.previewToken)
    expect(invoke).toHaveBeenCalledWith('send-pickup-notification', { body: { action: 'create-command', campaignId: 'campaign', mode: 'cold', messages: plan.messages, previewToken: preview.previewToken } })
  })
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
    await expect(gateway.createCommand('00000000-0000-4000-8000-000000000123', 'phase13', '通知', preview.previewToken)).rejects.toThrow('LINE 通知回傳格式錯誤')

    invoke.mockResolvedValueOnce({ data: { ...command, lineUserIds: ['secret'] }, error: null })
    await expect(gateway.createCommand('00000000-0000-4000-8000-000000000123', 'phase13', '通知', preview.previewToken)).rejects.toThrow('LINE 通知回傳格式錯誤')
  })

  it('rejects malformed preview recipient data', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { ...preview, mentionableRecipients: [{ lineUserId: 'secret' }] }, error: null })
    const gateway = createPickupNotificationGateway({ functions: { invoke } } as never)
    await expect(gateway.preview('00000000-0000-4000-8000-000000000123', 'phase13', '通知')).rejects.toThrow('LINE 通知回傳格式錯誤')
  })

  it('rejects a command prefix for the opposite destination', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ...command, command: '測試領取通知 T-AbCdEfGhIjKlMnOpQrStUv' },
      error: null,
    })
    const gateway = createPickupNotificationGateway({ functions: { invoke } } as never, 'production')
    await expect(gateway.createCommand(
      '00000000-0000-4000-8000-000000000123', 'phase13', '通知', preview.previewToken,
    )).rejects.toThrow('LINE 通知回傳格式錯誤')
  })
})
