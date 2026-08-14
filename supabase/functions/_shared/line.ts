import {
  assertVerifiedLineTokenPayload,
  LineVerificationError,
  type LineVerificationCode,
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
  error_description?: unknown
}

type Fetcher = typeof fetch

export function lineVerificationPublicMessage(error: unknown): string | null {
  return error instanceof LineVerificationError
    ? `LINE身分驗證失敗（${error.code}）`
    : null
}

function verificationCodeFromDescription(description: unknown): LineVerificationCode {
  switch (description) {
    case 'Invalid IdToken.': return 'LINE_INVALID_TOKEN'
    case 'Invalid IdToken Issuer.': return 'LINE_INVALID_ISSUER'
    case 'IdToken expired.': return 'LINE_TOKEN_EXPIRED'
    case 'Invalid IdToken Audience.': return 'LINE_INVALID_AUDIENCE'
    case 'Invalid IdToken Nonce.': return 'LINE_INVALID_NONCE'
    case 'Invalid IdToken Subject Identifier.': return 'LINE_INVALID_SUBJECT'
    default: return 'LINE_VERIFY_REJECTED'
  }
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
  if (!response.ok) throw new LineVerificationError(
    verificationCodeFromDescription(payload.error_description),
  )

  return {
    subject: assertVerifiedLineTokenPayload(payload, channelId, nowSeconds),
    displayName: typeof payload.name === 'string' ? payload.name : null,
    pictureUrl: typeof payload.picture === 'string' ? payload.picture : null,
  }
}
