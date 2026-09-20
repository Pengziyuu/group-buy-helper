import type { PickupNotificationAudience, PickupNotificationRecipient } from '../domain/pickupNotification'

export type PickupNotificationDestination = 'production' | 'test'

export type PickupNotificationPreview = {
  previewToken: string | null
  mentionableRecipients: PickupNotificationRecipient[]
  unavailableRecipients: PickupNotificationRecipient[]
  mentionableCount: number
  messageCount: number
}

export type PickupNotificationCommand = {
  status: 'awaiting_group_command'
  command: string
  expiresAt: string
  mentionableCount: number
  messageCount: number
}

export type PickupNotificationResponse = PickupNotificationPreview

type PickupNotificationClient = {
  functions: {
    invoke(name: string, options: { body: Record<string, unknown> }): Promise<{ data: unknown; error: unknown }>
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

const SAFE_PROVIDER_ERRORS = new Set([
  '需要團主登入', '團主登入已失效', '需要團主權限', '需要已核准的LINE團主身分',
  '通知動作格式錯誤', '團購識別格式錯誤', '通知期別格式錯誤', '測試通知必須保留【測試】前綴',
  'LINE通知服務尚未設定', 'LINE通知預覽加密尚未設定', '預覽憑證無效，請重新預覽',
  '預覽已失效，請重新預覽', '通知名單已變更，請重新預覽', '通知名單或群組已變更，請重新預覽',
  '尚未綁定LINE通知群組', '團購結單後才能發送領取通知', '找不到團購', '目前沒有可在群組＠的購買者',
  '測試團購不能從正式介面產生指令', '此團購尚未加入通知測試中心',
  '預覽次數過於頻繁，請稍後再試', '產生指令過於頻繁，請稍後再試',
  '無法確認購買者是否仍在LINE群組，請檢查官方帳號與群組設定',
])

async function functionErrorMessage(error: unknown): Promise<string> {
  const value = record(error)
  const context = value?.context
  if (context && typeof context === 'object' && 'clone' in context) {
    try {
      const payload = record(await (context as Response).clone().json())
      if (typeof payload?.error === 'string' && SAFE_PROVIDER_ERRORS.has(payload.error)) return payload.error
    } catch {
      // Use a fixed fallback; never expose arbitrary provider text.
    }
  }
  return '目前無法產生通知指令，請稍後再試。'
}

function recipient(value: unknown): PickupNotificationRecipient | null {
  const item = record(value)
  if (!item) return null
  const allowed = new Set(['memberCode', 'displayName', 'pictureUrl', 'period', 'unit', 'paid'])
  if (Object.keys(item).some((key) => !allowed.has(key))) return null
  if (typeof item.memberCode !== 'string' || typeof item.displayName !== 'string'
    || !(item.pictureUrl === null || typeof item.pictureUrl === 'string') || typeof item.period !== 'number'
    || typeof item.unit !== 'string' || typeof item.paid !== 'boolean') return null
  return item as PickupNotificationRecipient
}

function validCount(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maximum
}

function parsePreview(value: unknown): PickupNotificationPreview {
  const data = record(value)
  const allowed = new Set(['previewToken', 'mentionableRecipients', 'unavailableRecipients', 'mentionableCount', 'messageCount'])
  const validToken = data?.previewToken === null || (typeof data?.previewToken === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{20,12000}$/i.test(data.previewToken))
  if (!data || Object.keys(data).some((key) => !allowed.has(key)) || !validToken
    || !Array.isArray(data.mentionableRecipients) || !Array.isArray(data.unavailableRecipients)
    || !validCount(data.mentionableCount, 100) || !validCount(data.messageCount, 5)) throw new Error('LINE通知回傳格式錯誤')
  const mentionableRecipients = data.mentionableRecipients.map(recipient)
  const unavailableRecipients = data.unavailableRecipients.map(recipient)
  if (mentionableRecipients.some((item) => !item) || unavailableRecipients.some((item) => !item)
    || data.mentionableCount !== mentionableRecipients.length) throw new Error('LINE通知回傳格式錯誤')
  return {
    previewToken: data.previewToken as string | null,
    mentionableRecipients: mentionableRecipients as PickupNotificationRecipient[],
    unavailableRecipients: unavailableRecipients as PickupNotificationRecipient[],
    mentionableCount: data.mentionableCount,
    messageCount: data.messageCount,
  }
}

function parseCommand(value: unknown, destination: PickupNotificationDestination): PickupNotificationCommand {
  const data = record(value)
  const allowed = new Set(['status', 'command', 'expiresAt', 'mentionableCount', 'messageCount'])
  if (!data || Object.keys(data).some((key) => !allowed.has(key)) || data.status !== 'awaiting_group_command'
    || typeof data.command !== 'string'
    || !(destination === 'test' ? /^測試領取通知 T-[A-Za-z0-9_-]{22}$/ : /^發送領取通知 P-[A-Za-z0-9_-]{22}$/).test(data.command)
    || typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt))
    || !validCount(data.mentionableCount, 100) || data.mentionableCount < 1
    || !validCount(data.messageCount, 5) || data.messageCount < 1) throw new Error('LINE通知回傳格式錯誤')
  return data as PickupNotificationCommand
}

export function createPickupNotificationGateway(client: PickupNotificationClient, destination: PickupNotificationDestination = 'production') {
  const functionName = destination === 'test' ? 'send-test-pickup-notification' : 'send-pickup-notification'
  const invoke = async (body: Record<string, unknown>) => {
    const response = await client.functions.invoke(functionName, { body })
    if (response.error) throw new Error(await functionErrorMessage(response.error))
    return response.data
  }
  return {
    preview: async (campaignId: string, audience: PickupNotificationAudience, message: string) => parsePreview(await invoke({ action: 'preview', campaignId, audience, message })),
    createCommand: async (campaignId: string, audience: PickupNotificationAudience, message: string, previewToken: string) => parseCommand(await invoke({ action: 'create-command', campaignId, audience, message, previewToken }), destination),
  }
}
