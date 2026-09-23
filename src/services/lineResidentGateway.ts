import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type { ResidentLineIdentity } from '../ResidentCampaignListApp'

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

const admissionMessages = {
  GROUP_MEMBERSHIP_REQUIRED: '請先加入社區團購群組，才能使用團購系統',
  GROUP_MEMBERSHIP_UNAVAILABLE: '目前無法確認群組資格，請稍後再試或聯繫團主',
} as const

export class ResidentAdmissionError extends Error {
  readonly code: keyof typeof admissionMessages

  constructor(code: keyof typeof admissionMessages) {
    super(admissionMessages[code])
    this.name = 'ResidentAdmissionError'
    this.code = code
  }
}

async function functionError(error: unknown): Promise<Error> {
  const context = record(error)?.context
  if (context && typeof context === 'object' && 'clone' in context) {
    try {
      const payload = record(await (context as Response).clone().json())
      if (payload?.code === 'GROUP_MEMBERSHIP_REQUIRED' || payload?.code === 'GROUP_MEMBERSHIP_UNAVAILABLE') {
        return new ResidentAdmissionError(payload.code)
      }
    } catch {
      // Never render arbitrary provider response text.
    }
  }
  return new Error('LINE住戶登入失敗，請稍後重試或聯繫團主')
}

export type LineResidentSignInResult = {
  session: Session
  identity: ResidentLineIdentity
}

export function createLineResidentGateway(client: SupabaseClient<Database>) {
  return {
    async signIn(idToken: string): Promise<LineResidentSignInResult> {
      const response = await client.functions.invoke('line-resident-login', {
        body: { idToken },
      })
      if (response.error) {
        throw await functionError(response.error)
      }
      const data = record(response.data)
      if (data?.status !== 'approved'
        || typeof data.tokenHash !== 'string'
        || data.verificationType !== 'email'
        || typeof data.displayName !== 'string') {
        throw new Error('LINE住戶登入回應無效')
      }

      const exchanged = await client.auth.verifyOtp({
        type: 'email',
        token_hash: data.tokenHash,
      })
      if (exchanged.error || !exchanged.data.session) {
        throw exchanged.error ?? new Error('住戶登入憑證交換失敗')
      }
      const session = exchanged.data.session
      const verified = await client.auth.getUser(session.access_token)
      if (verified.error || !verified.data.user || verified.data.user.id !== session.user.id) {
        throw new Error('住戶登入驗證失敗')
      }

      return {
        session: { ...session, user: verified.data.user },
        identity: {
          displayName: data.displayName,
          pictureUrl: typeof data.pictureUrl === 'string' ? data.pictureUrl : null,
        },
      }
    },
  }
}
