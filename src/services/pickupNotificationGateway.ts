import type { PickupNotificationAudience, PickupNotificationRecipient } from '../domain/pickupNotification'

export type PickupNotificationDestination = 'production' | 'test'

export type PickupNotificationResponse = {
  sent: boolean
  previewToken: string | null
  mentionableRecipients: PickupNotificationRecipient[]
  unavailableRecipients: PickupNotificationRecipient[]
  mentionableCount: number
  messageCount: number
}

type PickupNotificationClient = {
  functions: {
    invoke(name: string, options: { body: Record<string, unknown> }): Promise<{ data: unknown; error: unknown }>
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

async function functionErrorMessage(error: unknown): Promise<string> {
  const value = record(error)
  const context = value?.context
  if (context && typeof context === 'object' && 'clone' in context) {
    try {
      const response = (context as Response).clone()
      const payload = record(await response.json())
      if (typeof payload?.error === 'string' && payload.error) return payload.error
    } catch {
      // Fall back to the SDK error message.
    }
  }
  return errorMessage(error)
}

function recipient(value: unknown): PickupNotificationRecipient | null {
  const item = record(value)
  if (!item) return null
  const allowed = new Set(['memberCode', 'displayName', 'pictureUrl', 'period', 'unit', 'paid'])
  if (Object.keys(item).some((key) => !allowed.has(key))) return null
  if (typeof item.memberCode !== 'string'
    || typeof item.displayName !== 'string'
    || !(item.pictureUrl === null || typeof item.pictureUrl === 'string')
    || typeof item.period !== 'number'
    || typeof item.unit !== 'string'
    || typeof item.paid !== 'boolean') return null
  return item as PickupNotificationRecipient
}

function parseResponse(value: unknown): PickupNotificationResponse {
  const data = record(value)
  const validPreviewToken = data?.previewToken === null
    || (typeof data?.previewToken === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{20,12000}$/i.test(data.previewToken))
  if (!data
    || typeof data.sent !== 'boolean'
    || !validPreviewToken
    || !Array.isArray(data.mentionableRecipients)
    || !Array.isArray(data.unavailableRecipients)
    || typeof data.mentionableCount !== 'number'
    || typeof data.messageCount !== 'number') {
    throw new Error('LINE通知回傳格式錯誤')
  }
  const mentionableRecipients = data.mentionableRecipients.map(recipient)
  const unavailableRecipients = data.unavailableRecipients.map(recipient)
  const sentAcknowledgementWithoutRows = data.sent === true
    && mentionableRecipients.length === 0 && unavailableRecipients.length === 0
  if (mentionableRecipients.some((item) => !item)
    || unavailableRecipients.some((item) => !item)
    || !Number.isInteger(data.mentionableCount)
    || data.mentionableCount < 0 || data.mentionableCount > 100
    || (!sentAcknowledgementWithoutRows && data.mentionableCount !== mentionableRecipients.length)
    || !Number.isInteger(data.messageCount)
    || data.messageCount < 0 || data.messageCount > 5) {
    throw new Error('LINE通知回傳格式錯誤')
  }
  return {
    sent: data.sent,
    previewToken: data.previewToken as string | null,
    mentionableRecipients: mentionableRecipients as PickupNotificationRecipient[],
    unavailableRecipients: unavailableRecipients as PickupNotificationRecipient[],
    mentionableCount: data.mentionableCount,
    messageCount: data.messageCount,
  }
}

export function createPickupNotificationGateway(
  client: PickupNotificationClient,
  destination: PickupNotificationDestination = 'production',
) {
  const invoke = async (
    action: 'preview' | 'send',
    campaignId: string,
    audience: PickupNotificationAudience,
    message: string,
    previewToken?: string,
  ) => {
    const body: Record<string, unknown> = { action, campaignId, audience, message }
    if (previewToken) body.previewToken = previewToken
    const functionName = destination === 'test'
      ? 'send-test-pickup-notification'
      : 'send-pickup-notification'
    const response = await client.functions.invoke(functionName, { body })
    if (response.error) throw new Error(await functionErrorMessage(response.error))
    return parseResponse(response.data)
  }

  return {
    preview: (campaignId: string, audience: PickupNotificationAudience, message: string) => invoke('preview', campaignId, audience, message),
    send: (campaignId: string, audience: PickupNotificationAudience, message: string, previewToken: string) => invoke('send', campaignId, audience, message, previewToken),
  }
}
