export function assertBindingAllowed(
  currentLineUserId: string | null,
  currentAuthUserId: string | null,
  requestedLineUserId: string,
  requestedAuthUserId: string,
): void {
  const lineConflict = currentLineUserId !== null && currentLineUserId !== requestedLineUserId
  const authConflict = currentAuthUserId !== null && currentAuthUserId !== requestedAuthUserId

  if (lineConflict || authConflict) {
    throw new Error('戶號已綁定其他 LINE 帳號，請聯絡團主')
  }
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
