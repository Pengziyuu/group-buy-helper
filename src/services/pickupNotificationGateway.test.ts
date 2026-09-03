import { describe, expect, it, vi } from 'vitest'
import { createPickupNotificationGateway } from './pickupNotificationGateway'

const response = {
  sent: false,
  previewToken: '92000000-0000-4000-8000-000000000001.ABCD_opaque_snapshot',
  mentionableRecipients: [{
    memberCode: 'member-a', displayName: '住戶A', pictureUrl: null, period: 1, unit: 'A1', paid: false,
  }],
  unavailableRecipients: [],
  mentionableCount: 1,
  messageCount: 1,
}

describe('pickup notification gateway', () => {
  it('previews and sends through the protected edge function', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: response, error: null })
    const gateway = createPickupNotificationGateway({ functions: { invoke } } as never)

    await expect(gateway.preview('00000000-0000-4000-8000-000000000123', 'phase13', '領取通知')).resolves.toEqual(response)
    expect(invoke).toHaveBeenLastCalledWith('send-pickup-notification', {
      body: { action: 'preview', campaignId: '00000000-0000-4000-8000-000000000123', audience: 'phase13', message: '領取通知' },
    })

    invoke.mockResolvedValueOnce({ data: { ...response, sent: true }, error: null })
    await expect(gateway.send('00000000-0000-4000-8000-000000000123', 'phase2', '二期通知', response.previewToken)).resolves.toMatchObject({ sent: true })
    expect(invoke).toHaveBeenLastCalledWith('send-pickup-notification', {
      body: { action: 'send', campaignId: '00000000-0000-4000-8000-000000000123', audience: 'phase2', message: '二期通知', previewToken: response.previewToken },
    })
  })

  it('fixes a test gateway to the test destination for every request', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: response, error: null })
    const gateway = createPickupNotificationGateway({ functions: { invoke } } as never, 'test')

    await gateway.preview('00000000-0000-4000-8000-000000000123', 'phase2', '【測試】通知')
    expect(invoke).toHaveBeenCalledWith('send-test-pickup-notification', {
      body: { action: 'preview', campaignId: '00000000-0000-4000-8000-000000000123', audience: 'phase2', message: '【測試】通知' },
    })
  })

  it('accepts a sent idempotency acknowledgement without replaying sensitive recipient rows', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { ...response, sent: true, mentionableRecipients: [], unavailableRecipients: [], mentionableCount: 1 },
      error: null,
    })
    const gateway = createPickupNotificationGateway({ functions: { invoke } } as never)
    await expect(gateway.send('00000000-0000-4000-8000-000000000123', 'phase13', '通知', response.previewToken)).resolves.toMatchObject({ sent: true, mentionableCount: 1 })
  })

  it('rejects malformed responses instead of accepting leaked or incomplete identity data', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { ...response, mentionableRecipients: [{ lineUserId: 'secret' }] }, error: null })
    const gateway = createPickupNotificationGateway({ functions: { invoke } } as never)

    await expect(gateway.preview('00000000-0000-4000-8000-000000000123', 'phase13', '通知')).rejects.toThrow('LINE通知回傳格式錯誤')
  })
})
