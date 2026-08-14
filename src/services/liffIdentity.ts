export type LiffProfile = {
  userId: string
  displayName: string
  pictureUrl?: string
}

export type LiffClient = {
  init(options: { liffId: string }): Promise<unknown>
  isLoggedIn(): boolean
  isInClient?(): boolean
  login(): void
  logout?(): void
  getProfile(): Promise<LiffProfile>
  getIDToken(): string | null
}

export type LiffIdentity = {
  displayName: string
  pictureUrl?: string
  idToken: string
}

function isExpiredIdToken(idToken: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  try {
    const encodedPayload = idToken.split('.')[1]
    if (!encodedPayload) return false
    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=')
    const payload = JSON.parse(atob(base64)) as { exp?: unknown }
    return typeof payload.exp === 'number' && payload.exp <= nowSeconds + 30
  } catch {
    return false
  }
}

export async function loadLiffIdentity(
  client: LiffClient,
  liffId: string,
): Promise<LiffIdentity | null> {
  await client.init({ liffId })

  if (!client.isLoggedIn()) {
    client.login()
    return null
  }

  const idToken = client.getIDToken()
  if (!idToken) throw new Error('登入成功但缺少 LINE ID token，請重新開啟頁面')
  if (isExpiredIdToken(idToken)) {
    if (client.isInClient?.() ?? true) throw new Error('LINE登入已過期，請關閉後重新開啟頁面')
    if (!client.logout) throw new Error('LINE登入已過期，請重新開啟頁面')
    client.logout()
    client.login()
    return null
  }
  const profile = await client.getProfile()

  return {
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
    idToken,
  }
}
