export type VerifiedLineTokenPayload = {
  iss?: unknown
  aud?: unknown
  sub?: unknown
  exp?: unknown
  iat?: unknown
}

export type LineVerificationCode =
  | 'LINE_VERIFY_REJECTED'
  | 'LINE_INVALID_TOKEN'
  | 'LINE_INVALID_ISSUER'
  | 'LINE_INVALID_AUDIENCE'
  | 'LINE_INVALID_SUBJECT'
  | 'LINE_INVALID_NONCE'
  | 'LINE_TOKEN_EXPIRED'
  | 'LINE_INVALID_ISSUED_AT'

export class LineVerificationError extends Error {
  readonly code: LineVerificationCode

  constructor(code: LineVerificationCode) {
    super(code)
    this.name = 'LineVerificationError'
    this.code = code
  }
}

export function assertVerifiedLineTokenPayload(
  payload: VerifiedLineTokenPayload,
  channelId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  if (payload.iss !== 'https://access.line.me') throw new LineVerificationError('LINE_INVALID_ISSUER')
  if (payload.aud !== channelId) throw new LineVerificationError('LINE_INVALID_AUDIENCE')
  if (typeof payload.sub !== 'string' || !payload.sub) throw new LineVerificationError('LINE_INVALID_SUBJECT')
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds - 30) throw new LineVerificationError('LINE_TOKEN_EXPIRED')
  if (typeof payload.iat !== 'number' || payload.iat > nowSeconds + 30) throw new LineVerificationError('LINE_INVALID_ISSUED_AT')
  return payload.sub
}

export function assertOrganizerAuthenticationMethod(
  isLineOrganizer: boolean,
  authenticationMethod: string,
): void {
  if (isLineOrganizer && !['magiclink', 'otp', 'token_refresh'].includes(authenticationMethod)) {
    throw new Error('LINE團主必須重新完成LINE驗證')
  }
}

export function assertOrganizerBinding(
  boundAuthUserId: string,
  adminAuthUserId: string | null,
): string {
  if (!boundAuthUserId || adminAuthUserId !== boundAuthUserId) {
    throw new Error('團主資格設定不完整')
  }
  return boundAuthUserId
}

export function selectLineResidentAuthUserId(
  organizerAuthUserId: string | null,
  residentAuthUserId: string | null,
): string | null {
  if (organizerAuthUserId && residentAuthUserId && organizerAuthUserId !== residentAuthUserId) {
    throw new Error('LINE身分綁定衝突')
  }
  return organizerAuthUserId ?? residentAuthUserId
}

export function normalizeOrderItems(
  input: unknown,
  allowedCodes: string[],
): Record<string, number> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('訂單品項格式錯誤')
  }

  const allowed = new Set(allowedCodes.map((code) => code.toUpperCase()))
  const result: Record<string, number> = {}

  for (const [rawCode, rawQuantity] of Object.entries(input)) {
    const code = rawCode.toUpperCase()
    if (!allowed.has(code)) throw new Error(`不存在的品項：${code}`)
    if (typeof rawQuantity !== 'number' || !Number.isInteger(rawQuantity) || rawQuantity < 0 || rawQuantity > 20) {
      throw new Error(`${code} 數量必須是 0 到 20 的整數`)
    }
    if (rawQuantity > 0) result[code] = rawQuantity
  }

  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))
}
