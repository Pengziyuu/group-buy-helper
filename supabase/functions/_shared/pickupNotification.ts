export const LINE_MENTION_LIMIT = 20
export const LINE_PUSH_MESSAGE_LIMIT = 5
export const MAX_PICKUP_NOTIFICATION_RECIPIENTS = LINE_MENTION_LIMIT * LINE_PUSH_MESSAGE_LIMIT

export type PickupMentionRecipient = {
  lineUserId: string
}

type LineMentionSubstitution = {
  type: 'mention'
  mentionee: {
    type: 'user'
    userId: string
  }
}

export type LineTextV2Message = {
  type: 'textV2'
  text: string
  substitution: Record<string, LineMentionSubstitution>
}

function decodeBase64(value: string): Uint8Array {
  try {
    const binary = atob(value)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    return new Uint8Array()
  }
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('預覽憑證無效')
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  return decodeBase64(padded)
}

async function snapshotEncryptionKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error('通知預覽加密尚未設定')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export type SealedPickupRecipientSnapshot = {
  intentId: string
  groupId: string
  lineUserIds: string[]
}

export async function sealPickupRecipientSnapshot(
  secret: string,
  intentId: string,
  groupId: string,
  lineUserIds: string[],
): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(intentId)
    || !/^C[0-9a-f]{32}$/iu.test(groupId)
    || lineUserIds.length < 1 || lineUserIds.length > MAX_PICKUP_NOTIFICATION_RECIPIENTS
    || lineUserIds.some((id) => !/^U[0-9a-f]{32}$/iu.test(id))
    || new Set(lineUserIds).size !== lineUserIds.length) {
    throw new Error('通知預覽快照格式錯誤')
  }
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify([groupId, lineUserIds]))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(intentId) },
    await snapshotEncryptionKey(secret),
    plaintext,
  )
  const packed = new Uint8Array(iv.byteLength + ciphertext.byteLength)
  packed.set(iv)
  packed.set(new Uint8Array(ciphertext), iv.byteLength)
  return `${intentId}.${encodeBase64Url(packed)}`
}

export async function openPickupRecipientSnapshot(
  secret: string,
  token: string,
): Promise<SealedPickupRecipientSnapshot> {
  try {
    const [intentId, encoded, extra] = token.split('.')
    if (extra !== undefined || !intentId || !encoded
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(intentId)) {
      throw new Error('invalid token')
    }
    const packed = decodeBase64Url(encoded)
    if (packed.byteLength <= 28) throw new Error('invalid token')
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: packed.slice(0, 12), additionalData: new TextEncoder().encode(intentId) },
      await snapshotEncryptionKey(secret),
      packed.slice(12),
    )
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext))
    if (!Array.isArray(parsed) || parsed.length !== 2) throw new Error('invalid token')
    const [groupId, lineUserIds] = parsed
    if (typeof groupId !== 'string' || !/^C[0-9a-f]{32}$/iu.test(groupId)
      || !Array.isArray(lineUserIds) || lineUserIds.length < 1
      || lineUserIds.length > MAX_PICKUP_NOTIFICATION_RECIPIENTS
      || lineUserIds.some((id) => typeof id !== 'string' || !/^U[0-9a-f]{32}$/iu.test(id))
      || new Set(lineUserIds).size !== lineUserIds.length) throw new Error('invalid token')
    return { intentId, groupId, lineUserIds: lineUserIds as string[] }
  } catch (error) {
    if (error instanceof Error && error.message === '通知預覽加密尚未設定') throw error
    throw new Error('預覽憑證無效')
  }
}

export async function technicalSha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function pickupEligibleRecipientSnapshotHash(lineUserIds: string[]): Promise<string> {
  const uniqueIds = [...new Set(lineUserIds)].sort()
  if (uniqueIds.some((id) => !/^U[0-9a-f]{32}$/i.test(id))) throw new Error('LINE住戶識別格式錯誤')
  return technicalSha256(uniqueIds.join('\n'))
}

export async function pickupRecipientSnapshotHash(groupId: string, lineUserIds: string[]): Promise<string> {
  if (!/^C[0-9a-f]{32}$/i.test(groupId)) throw new Error('LINE群組識別格式錯誤')
  const uniqueIds = [...new Set(lineUserIds)].sort()
  if (uniqueIds.some((id) => !/^U[0-9a-f]{32}$/i.test(id))) throw new Error('LINE住戶識別格式錯誤')
  return technicalSha256(JSON.stringify([groupId, uniqueIds]))
}

export async function verifyLineWebhookSignature(
  rawBody: string,
  signature: string,
  channelSecret: string,
): Promise<boolean> {
  if (!signature || !channelSecret) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const decoded = decodeBase64(signature)
  if (decoded.byteLength !== 32) return false
  const signatureBuffer = Uint8Array.from(decoded).buffer
  const bodyBuffer = Uint8Array.from(new TextEncoder().encode(rawBody)).buffer
  return crypto.subtle.verify('HMAC', key, signatureBuffer, bodyBuffer)
}

export async function getLineGroupMemberIdsForCandidates(
  groupId: string,
  candidateIds: string[],
  channelAccessToken: string,
  request: typeof fetch = fetch,
): Promise<string[]> {
  if (!/^C[0-9a-f]{32}$/i.test(groupId)
    || candidateIds.some((id) => !/^U[0-9a-f]{32}$/i.test(id))
    || new Set(candidateIds).size !== candidateIds.length) {
    throw new Error('LINE群組查驗資料格式錯誤')
  }
  if (candidateIds.length === 0) return []

  const deadline = Date.now() + 30_000
  const isMember = new Array<boolean>(candidateIds.length).fill(false)
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(10, candidateIds.length) },
    async () => {
      while (nextIndex < candidateIds.length) {
        const index = nextIndex
        nextIndex += 1
        const remaining = deadline - Date.now()
        if (remaining <= 0) throw new Error('LINE群組成員查驗逾時')
        const userId = candidateIds[index]
        const url = `https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(userId)}`
        const response = await request(url, {
          headers: { Authorization: 'Bearer ' + channelAccessToken },
          signal: AbortSignal.timeout(Math.min(10_000, remaining)),
        })
        if (response.status === 200) {
          isMember[index] = true
        } else if (response.status !== 404) {
          throw new Error('無法確認LINE群組成員')
        }
      }
    },
  )
  await Promise.all(workers)
  return candidateIds.filter((_, index) => isMember[index])
}

export function buildPickupMentionMessages(
  recipients: PickupMentionRecipient[],
  rawBody: string,
): LineTextV2Message[] {
  const body = rawBody.trim()
  if (!body) throw new Error('通知內容不能空白')
  if (body.includes('{') || body.includes('}')) throw new Error('通知內容不能包含大括號')
  if (body.length > 4_500) throw new Error('通知內容過長')
  if (recipients.length === 0) throw new Error('沒有可＠的住戶')
  if (recipients.length > MAX_PICKUP_NOTIFICATION_RECIPIENTS) {
    throw new Error(`單次最多可＠${MAX_PICKUP_NOTIFICATION_RECIPIENTS}位住戶`)
  }

  const unique = new Set<string>()
  for (const recipient of recipients) {
    if (!/^U[0-9a-f]{32}$/i.test(recipient.lineUserId)) throw new Error('LINE住戶識別格式錯誤')
    if (unique.has(recipient.lineUserId)) throw new Error('LINE住戶名單包含重複資料')
    unique.add(recipient.lineUserId)
  }

  const messages: LineTextV2Message[] = []
  for (let offset = 0; offset < recipients.length; offset += LINE_MENTION_LIMIT) {
    const chunk = recipients.slice(offset, offset + LINE_MENTION_LIMIT)
    const substitution: Record<string, LineMentionSubstitution> = {}
    const mentions = chunk.map((recipient, index) => {
      const key = `user${index}`
      substitution[key] = {
        type: 'mention',
        mentionee: { type: 'user', userId: recipient.lineUserId },
      }
      return `{${key}}`
    })
    const text = `${mentions.join(' ')}\n${body}`
    if (text.length > 5_000) throw new Error('通知內容過長')
    messages.push({ type: 'textV2', text, substitution })
  }
  return messages
}
