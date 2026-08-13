type RateLimitClient = {
  rpc(name: string, parameters: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function enforceLineLoginRateLimit(
  client: RateLimitClient,
  address: string,
  pepper: string,
): Promise<void> {
  if (!pepper) throw new Error('LINE限流設定缺失')
  const limits = [
    { key: await sha256(`${pepper}:source:${address}`), limit: 10 },
    { key: await sha256(`${pepper}:global`), limit: 300 },
  ]

  for (const entry of limits) {
    const { data, error } = await client.rpc('consume_line_login_rate_limit', {
      p_key_hash: entry.key,
      p_limit: entry.limit,
      p_window_seconds: 300,
    })
    if (error) throw new Error('LINE登入限流服務暫時無法使用')
    if (data !== true) throw new Error('LINE登入嘗試過多，請稍後再試')
  }
}
