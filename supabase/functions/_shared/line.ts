import {
  assertVerifiedLineTokenPayload,
  LineVerificationError,
  type VerifiedLineTokenPayload,
} from './policies.ts'

export type VerifiedLineIdentity = {
  subject: string
  displayName: string | null
  pictureUrl: string | null
}

type LineVerifyPayload = VerifiedLineTokenPayload & {
  name?: unknown
  picture?: unknown
}

type Fetcher = typeof fetch

export function lineVerificationPublicMessage(error: unknown): string | null {
  return error instanceof LineVerificationError
    ? `LINE身分驗證失敗（${error.code}）`
    : null
}

export async function verifyLineIdToken(
  idToken: string,
  channelId: string,
  fetcher: Fetcher = fetch,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<VerifiedLineIdentity> {
  if (!idToken) throw new Error('缺少 LINE ID token')
  if (!channelId) throw new Error('LINE Channel ID 未設定')

  const response = await fetcher('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  })
  let payload: LineVerifyPayload
  try {
    payload = await response.json() as LineVerifyPayload
  } catch {
    throw new Error('LINE 身分驗證回應格式錯誤')
  }
  if (!response.ok) throw new LineVerificationError('LINE_VERIFY_REJECTED')

  return {
    subject: assertVerifiedLineTokenPayload(payload, channelId, nowSeconds),
    displayName: typeof payload.name === 'string' ? payload.name : null,
    pictureUrl: typeof payload.picture === 'string' ? payload.picture : null,
  }
}
