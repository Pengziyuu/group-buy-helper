import { loadLiffIdentity, type LiffClient, type LiffIdentity } from './liffIdentity'

export type LiveSupabaseClient = {
  auth: {
    getSession(): Promise<{ data: { session: unknown | null }; error: unknown }>
    signInAnonymously(): Promise<{ data: { session: unknown | null }; error: unknown }>
  }
  functions: {
    invoke(name: string, options: { body: unknown }): Promise<{ data: unknown; error: unknown }>
  }
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

export function createLiveGateway(
  supabase: LiveSupabaseClient,
  liff: LiffClient,
  liffId: string,
) {
  let identity: LiffIdentity | null = null

  return {
    async initialize(): Promise<LiffIdentity | null> {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw new Error(`讀取登入狀態失敗：${errorMessage(error)}`)
      if (!data.session) {
        const anonymous = await supabase.auth.signInAnonymously()
        if (anonymous.error || !anonymous.data.session) {
          throw new Error(`建立安全工作階段失敗：${errorMessage(anonymous.error)}`)
        }
      }
      identity = await loadLiffIdentity(liff, liffId)
      return identity
    },

    async bindCustomer(period: number, unit: string): Promise<unknown> {
      if (!identity) throw new Error('請先完成 LINE 登入')
      const { data, error } = await supabase.functions.invoke('bind-line-user', {
        body: {
          idToken: identity.idToken,
          period,
          unit: unit.trim().toUpperCase(),
        },
      })
      if (error) throw new Error(`綁定戶號失敗：${errorMessage(error)}`)
      return data
    },

    async submitOrder(campaignId: string, items: Record<string, number>): Promise<unknown> {
      const { data, error } = await supabase.functions.invoke('submit-order', {
        body: { campaignId, items },
      })
      if (error) throw new Error(`送出訂單失敗：${errorMessage(error)}`)
      return data
    },
  }
}
