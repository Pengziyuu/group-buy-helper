export type LiffProfile = {
  userId: string
  displayName: string
  pictureUrl?: string
}

export type LiffClient = {
  init(options: { liffId: string }): Promise<unknown>
  isLoggedIn(): boolean
  login(): void
  getProfile(): Promise<LiffProfile>
  getIDToken(): string | null
}

export type LiffIdentity = {
  lineUserId: string
  displayName: string
  pictureUrl?: string
  idToken: string
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

  const [profile, idToken] = await Promise.all([
    client.getProfile(),
    Promise.resolve(client.getIDToken()),
  ])
  if (!idToken) throw new Error('登入成功但缺少 LINE ID token，請重新開啟頁面')

  return {
    lineUserId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
    idToken,
  }
}
