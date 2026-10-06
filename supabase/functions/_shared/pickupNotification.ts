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
  destination: 'test' | 'production'
  groupId: string
  lineUserIds: string[]
  periods?: number[]
}

export async function sealPickupRecipientSnapshot(
  secret: string,
  intentId: string,
  destination: 'test' | 'production',
  groupId: string,
  lineUserIds: string[],
  periods?: number[],
): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(intentId)
    || (destination !== 'test' && destination !== 'production')
    || !/^C[0-9a-f]{32}$/iu.test(groupId)
    || lineUserIds.length < 1 || lineUserIds.length > MAX_PICKUP_NOTIFICATION_RECIPIENTS
    || lineUserIds.some((id) => !/^U[0-9a-f]{32}$/iu.test(id))
    || new Set(lineUserIds).size !== lineUserIds.length
    || (periods !== undefined && (periods.length !== lineUserIds.length || periods.some((period) => ![1, 2, 3].includes(period))))) {
    throw new Error('通知預覽快照格式錯誤')
  }
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(periods === undefined
    ? [destination, groupId, lineUserIds] : [destination, groupId, lineUserIds, periods]))
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
    if (!Array.isArray(parsed) || ![3, 4].includes(parsed.length)) throw new Error('invalid token')
    const [destination, groupId, lineUserIds, periods] = parsed
    if ((destination !== 'test' && destination !== 'production')
      || typeof groupId !== 'string' || !/^C[0-9a-f]{32}$/iu.test(groupId)
      || !Array.isArray(lineUserIds) || lineUserIds.length < 1
      || lineUserIds.length > MAX_PICKUP_NOTIFICATION_RECIPIENTS
      || lineUserIds.some((id) => typeof id !== 'string' || !/^U[0-9a-f]{32}$/iu.test(id))
      || new Set(lineUserIds).size !== lineUserIds.length
      || (parsed.length === 4 && (!Array.isArray(periods) || periods.length !== lineUserIds.length
        || periods.some((period) => ![1, 2, 3].includes(period))))) throw new Error('invalid token')
    return { intentId, destination, groupId, lineUserIds: lineUserIds as string[],
      ...(parsed.length === 4 ? { periods: periods as number[] } : {}) }
  } catch (error) {
    if (error instanceof Error && error.message === '通知預覽加密尚未設定') throw error
    throw new Error('預覽憑證無效')
  }
}

export function pickupPeriodSnapshotMatches(
  snapshot: SealedPickupRecipientSnapshot,
  recipients: { lineUserId: string; period: number }[],
): boolean {
  return !!snapshot.periods && snapshot.periods.length === recipients.length
    && recipients.every((recipient, index) => recipient.lineUserId === snapshot.lineUserIds[index]
      && recipient.period === snapshot.periods![index])
}

// The group command only has to tell this organizer's pending notices apart: only the organizer who
// created it, in the bound group, within 10 minutes and once, can use it. So 4 characters will do,
// drawn from 32 that cannot be misread (no 0, O, 1, I).
const COMMAND_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const COMMAND_WORDS = { production: '發送領取通知', test: '測試領取通知' } as const
const SHORT_COMMAND = /^(發送領取通知|測試領取通知)[\s　]*([2-9A-HJ-NP-Za-hj-np-z]{4})$/u
// Commands issued before the short form (still valid for up to 10 minutes after the switch).
const LEGACY_COMMAND = /^(發送領取通知 P-|測試領取通知 T-)([A-Za-z0-9_-]{22})$/u

export function generatePickupReplyCommandCode(): string {
  const random = crypto.getRandomValues(new Uint8Array(4))
  return Array.from(random, (byte) => COMMAND_ALPHABET[byte & 31]).join('')
}

/** What the organizer pastes into the group. */
export function pickupReplyCommandText(destination: 'test' | 'production', code: string): string {
  return `${COMMAND_WORDS[destination]} ${code}`
}

/** The key whose hash is stored: test and production codes never match each other. */
export function pickupReplyCommandHashKey(destination: 'test' | 'production', code: string): string {
  return `${destination === 'test' ? 'T' : 'P'}-${code}`
}

/** A group message read as a pickup command, tolerant of spacing and letter case; null for anything else. */
export function parsePickupReplyCommand(text: string): { destination: 'test' | 'production'; hashKey: string } | null {
  const trimmed = text.trim()
  const short = trimmed.match(SHORT_COMMAND)
  if (short) {
    const destination = short[1] === COMMAND_WORDS.test ? 'test' : 'production'
    return { destination, hashKey: pickupReplyCommandHashKey(destination, short[2].toUpperCase()) }
  }
  const legacy = trimmed.match(LEGACY_COMMAND)
  if (legacy) {
    const destination = legacy[1].endsWith('T-') ? 'test' : 'production'
    return { destination, hashKey: pickupReplyCommandHashKey(destination, legacy[2]) }
  }
  return null
}

export async function sealPickupReplyPayload(secret: string, intentId: string, message: string): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(intentId)
    || !message.trim()) throw new Error('通知指令內容格式錯誤')
  assertPickupReplyPayloadSize(message)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const additionalData = new TextEncoder().encode(`pickup-reply:${intentId}`)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData },
    await snapshotEncryptionKey(secret),
    new TextEncoder().encode(message),
  )
  const packed = new Uint8Array(iv.byteLength + ciphertext.byteLength)
  packed.set(iv)
  packed.set(new Uint8Array(ciphertext), iv.byteLength)
  const encoded = encodeBase64Url(packed)
  if (encoded.length > 12_000) throw new Error('通知內容過長，無法產生指令')
  return encoded
}

export function assertPickupReplyPayloadSize(message: string): void {
  // AES-GCM adds a 12-byte IV and 16-byte tag; SQL caps base64url at 12000 characters.
  const packedBytes = new TextEncoder().encode(message).byteLength + 28
  const encodedLength = 4 * Math.ceil(packedBytes / 3) - ((3 - packedBytes % 3) % 3)
  if (message.length > 12_000 || encodedLength > 12_000) throw new Error('通知內容過長，無法產生指令')
}

export async function openPickupReplyPayload(secret: string, intentId: string, encrypted: string): Promise<string> {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(intentId)) throw new Error('invalid')
    const packed = decodeBase64Url(encrypted)
    if (packed.byteLength <= 28) throw new Error('invalid')
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: packed.slice(0, 12), additionalData: new TextEncoder().encode(`pickup-reply:${intentId}`) },
      await snapshotEncryptionKey(secret),
      packed.slice(12),
    )
    const message = new TextDecoder().decode(plaintext)
    if (!message.trim()) throw new Error('invalid')
    assertPickupReplyPayloadSize(message)
    return message
  } catch {
    throw new Error('通知指令內容無效')
  }
}

export async function technicalSha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function pickupEligibleRecipientSnapshotHash(
  recipients: string[] | { lineUserId: string; period: number }[],
  audience?: 'phase13' | 'phase2' | 'all' | 'combined',
): Promise<string> {
  if (audience === 'all' || audience === 'combined') {
    if (recipients.some((row) => typeof row === 'string')) throw new Error('通知期別快照格式錯誤')
    const rows = recipients as { lineUserId: string; period: number }[]
    if (rows.some((row) => !/^U[0-9a-f]{32}$/i.test(row.lineUserId) || ![1, 2, 3].includes(row.period))
      || new Set(rows.map((row) => row.lineUserId)).size !== rows.length) throw new Error('通知期別快照格式錯誤')
    return technicalSha256([...rows].sort((a, b) => a.lineUserId < b.lineUserId ? -1 : a.lineUserId > b.lineUserId ? 1 : 0)
      .map((row) => `${row.lineUserId}:${row.period}`).join('\n'))
  }
  const uniqueIds = [...new Set(recipients as string[])].sort()
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

export type PickupDualMode = 'ambient' | 'cold'
export type PickupDualBodies = { all: string } | { phase13: string; phase2: string }

function validatedPickupDualBodies(mode: PickupDualMode, value: unknown): PickupDualBodies {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('通知內容格式錯誤')
  const bodies = value as Record<string, unknown>
  if (mode === 'ambient') {
    if (Object.keys(bodies).length !== 1 || typeof bodies.all !== 'string') throw new Error('通知內容格式錯誤')
    return { all: bodies.all }
  }
  if (mode === 'cold') {
    if (Object.keys(bodies).length !== 2 || typeof bodies.phase13 !== 'string' || typeof bodies.phase2 !== 'string') throw new Error('通知內容格式錯誤')
    return { phase13: bodies.phase13, phase2: bodies.phase2 }
  }
  throw new Error('通知模式格式錯誤')
}

export function serializePickupDualModePayload(mode: PickupDualMode, bodies: PickupDualBodies): string {
  return JSON.stringify({ ...validatedPickupDualBodies(mode, bodies), batching: 'balanced-once' })
}

export function parsePickupDualModePayload(
  audience: 'all' | 'combined',
  raw: string,
): { bodies: PickupDualBodies; batching: 'balanced-once' | 'repeat' } {
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('通知指令內容格式錯誤')
  const values = value as Record<string, unknown>
  const batching = Object.hasOwn(values, 'batching') ? values.batching : 'repeat'
  if (batching !== 'balanced-once' && batching !== 'repeat') throw new Error('通知指令內容格式錯誤')
  if (batching === 'repeat' && Object.hasOwn(values, 'batching')) throw new Error('通知指令內容格式錯誤')
  const bodyValues = { ...values }
  delete bodyValues.batching
  return { bodies: validatedPickupDualBodies(audience === 'all' ? 'ambient' : 'cold', bodyValues), batching }
}

export function buildPickupDualModeMessages(
  mode: PickupDualMode,
  recipients: (PickupMentionRecipient & { period: number })[],
  bodies: PickupDualBodies,
  batching: 'balanced-once' | 'repeat' = 'balanced-once',
): LineTextV2Message[] {
  if (mode !== 'ambient' && mode !== 'cold') throw new Error('通知模式格式錯誤')
  if (recipients.some((recipient) => ![1, 2, 3].includes(recipient.period))) throw new Error('通知期別格式錯誤')
  if (new Set(recipients.map((recipient) => recipient.lineUserId)).size !== recipients.length) throw new Error('LINE住戶名單包含重複資料')
  const groups = mode === 'ambient'
    ? [{ recipients, body: 'all' in bodies ? bodies.all : '' }]
    : [
      { recipients: recipients.filter((recipient) => recipient.period !== 2), body: 'phase13' in bodies ? bodies.phase13 : '' },
      { recipients: recipients.filter((recipient) => recipient.period === 2), body: 'phase2' in bodies ? bodies.phase2 : '' },
    ]
  if (groups.some((group) => !group.body.trim())) throw new Error('通知內容不能空白')
  const messages = groups.flatMap((group) => group.recipients.length
    ? batching === 'repeat'
      ? buildPickupMentionMessages(group.recipients, group.body)
      : buildBalancedPickupMentionMessages(group.recipients, group.body)
    : [])
  if (messages.length > LINE_PUSH_MESSAGE_LIMIT) throw new Error(`需要${messages.length}則訊息，超過單一指令5則上限；目前無法產生涵蓋全部住戶的指令`)
  return messages
}

export function buildPickupMentionMessages(
  recipients: PickupMentionRecipient[],
  rawBody: string,
): LineTextV2Message[] {
  const body = validatePickupMentionInputs(recipients, rawBody)
  const messages: LineTextV2Message[] = []
  for (let offset = 0; offset < recipients.length; offset += LINE_MENTION_LIMIT) {
    messages.push(makePickupMentionMessage(recipients.slice(offset, offset + LINE_MENTION_LIMIT), body))
  }
  return messages
}

function validatePickupMentionInputs(recipients: PickupMentionRecipient[], rawBody: string): string {
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

  return body
}

function makePickupMentionMessage(chunk: PickupMentionRecipient[], body: string | null): LineTextV2Message {
  const substitution: Record<string, LineMentionSubstitution> = {}
  const mentions = chunk.map((recipient, index) => {
    const key = `user${index}`
    substitution[key] = { type: 'mention', mentionee: { type: 'user', userId: recipient.lineUserId } }
    return `{${key}}`
  })
  const text = `${mentions.join(' ')}${body === null ? '' : `\n${body}`}`
  if (text.length > 5_000) throw new Error('通知內容過長')
  return { type: 'textV2', text, substitution }
}

function buildBalancedPickupMentionMessages(recipients: PickupMentionRecipient[], rawBody: string): LineTextV2Message[] {
  const body = validatePickupMentionInputs(recipients, rawBody)
  const count = Math.ceil(recipients.length / LINE_MENTION_LIMIT)
  if (count === 1) return [makePickupMentionMessage(recipients, body)]

  // Text v2 replaces these tokens with names; their lengths give a stable, approximate
  // measure of the visible mention lines without relying on mutable display names.
  const mentionLength = (size: number) => Array.from({ length: size }, (_, index) => `{user${index}}`).join(' ').length
  let bestSizes: number[] = []
  let bestSpread = Number.POSITIVE_INFINITY
  for (let lastSize = Math.max(1, recipients.length - LINE_MENTION_LIMIT * (count - 1));
    lastSize <= Math.min(LINE_MENTION_LIMIT, recipients.length - count + 1); lastSize++) {
    const earlier = recipients.length - lastSize
    const base = Math.floor(earlier / (count - 1))
    const extra = earlier % (count - 1)
    const sizes = Array.from({ length: count - 1 }, (_, index) => base + (index < extra ? 1 : 0)).concat(lastSize)
    if (sizes.some((size) => size < 1 || size > LINE_MENTION_LIMIT)) continue
    const lengths = sizes.map((size, index) => mentionLength(size) + (index === count - 1 ? 1 + body.length : 0))
    const spread = Math.max(...lengths) - Math.min(...lengths)
    if (spread < bestSpread) {
      bestSizes = sizes
      bestSpread = spread
    }
  }
  if (!bestSizes.length) throw new Error('通知分批格式錯誤')
  let offset = 0
  return bestSizes.map((size, index) => {
    const chunk = recipients.slice(offset, offset + size)
    offset += size
    return makePickupMentionMessage(chunk, index === bestSizes.length - 1 ? body : null)
  })
}
