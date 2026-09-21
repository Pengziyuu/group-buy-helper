import { describe, expect, it, vi } from 'vitest'
import { createAutoCloseNotificationSettingsGateway } from './autoCloseNotificationSettingsGateway'

describe('auto-close notification settings gateway', () => {
  it.each(['unconfigured', 'current_user', 'other_organizer'] as const)(
    'loads the display-safe %s state without any organizer identifier',
    async (state) => {
      const rpc = vi.fn().mockResolvedValue({ data: state, error: null })
      const gateway = createAutoCloseNotificationSettingsGateway({ rpc } as never)

      await expect(gateway.getState()).resolves.toBe(state)
      expect(rpc).toHaveBeenCalledWith('get_auto_close_notification_setting')
    },
  )

  it('sets the currently authenticated approved organizer without client-supplied identity', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    const gateway = createAutoCloseNotificationSettingsGateway({ rpc } as never)

    await expect(gateway.selectCurrentUser()).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('set_my_auto_close_notification_organizer')
  })

  it('rejects malformed or identity-leaking response shapes', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { state: 'current_user', line_user_id: 'secret' }, error: null })
    const gateway = createAutoCloseNotificationSettingsGateway({ rpc } as never)

    await expect(gateway.getState()).rejects.toThrow('通知團主設定格式錯誤')
  })
})
