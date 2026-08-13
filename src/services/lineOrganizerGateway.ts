import type { Session } from '@supabase/supabase-js'
import { loadLiffIdentity, type LiffClient } from './liffIdentity'

export type LineOrganizerResult =
  | { status: 'redirecting' }
  | { status: 'pending'; requestCode: string; displayName: string | null }
  | { status: 'approved'; session: Session }

type LineOrganizerClient = {
  auth: {
    verifyOtp(input: { token_hash: string; type: 'email' }): Promise<{
      data: { session: Session | null }
      error: unknown
    }>
    getUser(accessToken: string): Promise<{
      data: { user: { id: string } | null }
      error: unknown
    }>
  }
  functions: {
    invoke(name: string, options: { body: Record<string, unknown> }): Promise<{ data: unknown; error: unknown }>
  }
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function createLineOrganizerGateway(
  client: LineOrganizerClient,
  liff: LiffClient,
  liffId: string,
) {
  return {
    async signIn(): Promise<LineOrganizerResult> {
      const identity = await loadLiffIdentity(liff, liffId)
      if (!identity) return { status: 'redirecting' }

      const response = await client.functions.invoke('line-organizer-login', {
        body: { idToken: identity.idToken },
      })
      const data = record(response.data)
      if (data?.status === 'pending'
        && typeof data.requestCode === 'string') {
        return {
          status: 'pending',
          requestCode: data.requestCode,
          displayName: typeof data.displayName === 'string' ? data.displayName : null,
        }
      }
      if (response.error) throw new Error(`LINE 團主登入失敗：${errorMessage(response.error)}`)
      if (data?.status !== 'approved'
        || typeof data.tokenHash !== 'string'
        || data.verificationType !== 'email') {
        throw new Error('LINE 團主登入回應格式錯誤')
      }

      const verified = await client.auth.verifyOtp({
        token_hash: data.tokenHash,
        type: 'email',
      })
      if (verified.error || !verified.data.session) {
        throw new Error(`建立團主登入狀態失敗：${errorMessage(verified.error)}`)
      }
      const session = verified.data.session
      const authoritative = await client.auth.getUser(session.access_token)
      if (authoritative.error || !authoritative.data.user
        || authoritative.data.user.id !== session.user.id) {
        throw new Error('團主登入狀態驗證失敗')
      }
      return { status: 'approved', session: { ...session, user: { ...session.user, ...authoritative.data.user } } }
    },
  }
}
