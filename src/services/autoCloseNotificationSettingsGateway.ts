import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

export type AutoCloseNotificationSettingState = 'unconfigured' | 'current_user' | 'other_organizer'

function isSettingState(value: unknown): value is AutoCloseNotificationSettingState {
  return value === 'unconfigured' || value === 'current_user' || value === 'other_organizer'
}

function publicError(error: unknown, fallback: string) {
  const message = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : ''
  if (/admin permission required/i.test(message)) return new Error('只有已核准團主可以管理通知設定')
  if (/approved line organizer required/i.test(message)) return new Error('目前LINE帳號尚未取得團主權限')
  return new Error(fallback)
}

export function createAutoCloseNotificationSettingsGateway(client: SupabaseClient<Database>) {
  return {
    async getState(): Promise<AutoCloseNotificationSettingState> {
      const { data, error } = await client.rpc('get_auto_close_notification_setting')
      if (error) throw publicError(error, '暫時無法讀取自動結單通知設定')
      if (!isSettingState(data)) throw new Error('通知團主設定格式錯誤')
      return data
    },

    async selectCurrentUser(): Promise<void> {
      const { data, error } = await client.rpc('set_my_auto_close_notification_organizer')
      if (error) throw publicError(error, '暫時無法儲存自動結單通知設定')
      if (data !== true) throw new Error('暫時無法儲存自動結單通知設定')
    },
  }
}
