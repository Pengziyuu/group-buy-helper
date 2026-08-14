import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type { ResidentLineIdentity } from '../ResidentCampaignListApp'

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function functionErrorMessage(error: unknown): Promise<string> {
  const context = record(error)?.context
  if (context && typeof context === 'object' && 'clone' in context) {
    try {
      const payload = record(await (context as Response).clone().json())
      if (typeof payload?.error === 'string' && payload.error) return payload.error
    } catch {
      // Fall back to the SDK error when the gateway did not return safe JSON.
    }
  }
  return errorMessage(error)
}

export type LineResidentSignInResult = {
  session: Session
  identity: ResidentLineIdentity
}

export function createLineResidentGateway(client: SupabaseClient<Database>) {
  return {
    async signIn(idToken: string, inviteSlug: string): Promise<LineResidentSignInResult> {
      const response = await client.functions.invoke('line-resident-login', {
        body: { idToken, inviteSlug },
      })
      if (response.error) {
        throw new Error(`LINE住戶登入失敗：${await functionErrorMessage(response.error)}`)
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
