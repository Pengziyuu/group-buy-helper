import { createClient } from 'npm:@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/http.ts'
import {
  buildPickupMentionMessages,
  getLineGroupMemberIdsForCandidates,
  openPickupReplyPayload,
  pickupEligibleRecipientSnapshotHash,
  pickupRecipientSnapshotHash,
  technicalSha256,
  verifyLineWebhookSignature,
  type LineTextV2Message,
} from '../_shared/pickupNotification.ts'

const COMMUNITY_ID = '00000000-0000-4000-8000-000000000001'
const TEST_BIND_COMMAND = '綁定測試團購通知'
const PRODUCTION_BIND_COMMAND = '綁定正式團購通知'
const PICKUP_COMMAND = /^(發送領取通知 P-|測試領取通知 T-)([A-Za-z0-9_-]{22})$/

type LineWebhookEvent = {
  type?: unknown
  webhookEventId?: unknown
  timestamp?: unknown
  replyToken?: unknown
  source?: { type?: unknown; groupId?: unknown; userId?: unknown }
  message?: { type?: unknown; text?: unknown }
}

type ReplyCommand = {
  intent_token: string
  campaign_id: string
  audience: 'phase13' | 'phase2'
  binding_kind: 'test' | 'production'
  payload_ciphertext: string
  message_hash: string
  recipient_hash: string
  recipient_count: number
  message_count: number
}

type RecipientRow = { line_user_id: string }

async function replyMessages(channelAccessToken: string, replyToken: string, messages: LineTextV2Message[] | { type: 'text'; text: string }[]) {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + channelAccessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyToken, messages }),
      signal: AbortSignal.timeout(10_000),
    })
    return { ok: response.ok, timedOut: false, status: response.status }
  } catch {
    return { ok: false, timedOut: true, status: 0 }
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: '只接受 POST' }, 405)

  try {
    const channelSecret = Deno.env.get('LINE_MESSAGING_CHANNEL_SECRET') ?? ''
    const channelAccessToken = Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') ?? ''
    const intentSecret = Deno.env.get('PICKUP_NOTIFICATION_INTENT_SECRET') ?? ''
    if (!channelSecret || !channelAccessToken || intentSecret.length < 32) return jsonResponse({ error: 'LINE webhook尚未設定' }, 503)

    const declaredLength = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(declaredLength) && declaredLength > 65_536) return jsonResponse({ error: '請求內容過大' }, 413)
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > 65_536) return jsonResponse({ error: '請求內容過大' }, 413)
    if (!await verifyLineWebhookSignature(rawBody, request.headers.get('x-line-signature') ?? '', channelSecret)) {
      return jsonResponse({ error: 'LINE簽章驗證失敗' }, 401)
    }

    const parsed: unknown = JSON.parse(rawBody)
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { events?: unknown }).events)) {
      return jsonResponse({ error: 'LINE webhook格式錯誤' }, 400)
    }

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

    for (const event of (parsed as { events: LineWebhookEvent[] }).events) {
      if (event.type !== 'message' || event.message?.type !== 'text' || event.source?.type !== 'group') continue
      const messageText = typeof event.message.text === 'string' ? event.message.text : ''
      const webhookEventId = typeof event.webhookEventId === 'string' ? event.webhookEventId : ''
      const timestamp = typeof event.timestamp === 'number' ? event.timestamp : Number.NaN
      const groupId = typeof event.source.groupId === 'string' ? event.source.groupId : ''
      const lineUserId = typeof event.source.userId === 'string' ? event.source.userId : ''
      const replyToken = typeof event.replyToken === 'string' ? event.replyToken : ''
      if (!webhookEventId || webhookEventId.length > 255 || !Number.isFinite(timestamp)
        || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000 || !replyToken
        || !/^C[0-9a-f]{32}$/i.test(groupId) || !/^U[0-9a-f]{32}$/i.test(lineUserId)) continue

      const commandMatch = messageText.match(PICKUP_COMMAND)
      if (commandMatch) {
        const code = `${commandMatch[1].endsWith('P-') ? 'P-' : 'T-'}${commandMatch[2]}`
        const commandHash = await technicalSha256(`pickup-command:${code}`)
        const { data: inspected, error: inspectError } = await service.rpc('inspect_pickup_notification_reply_command', {
          p_command_hash: commandHash,
          p_line_group_id: groupId,
          p_line_user_id: lineUserId,
        }).maybeSingle()
        if (inspectError) throw inspectError
        if (!inspected) continue
        const command = inspected as ReplyCommand

        let message = ''
        try {
          message = await openPickupReplyPayload(intentSecret, command.intent_token, command.payload_ciphertext)
        } catch {
          const { data: rejected } = await service.rpc('reject_pickup_notification_reply_command', {
            p_command_hash: commandHash,
            p_webhook_event_id: webhookEventId,
            p_line_group_id: groupId,
            p_line_user_id: lineUserId,
            p_failure_code: 'invalid_payload',
          })
          if (rejected === true) await replyMessages(channelAccessToken, replyToken, [{ type: 'text', text: '這個通知指令無法使用，請回到團主後台重新產生。' }])
          continue
        }

        const { data: recipientData, error: recipientError } = await service.rpc('internal_pickup_notification_recipients', {
          p_campaign_id: command.campaign_id,
          p_audience: command.audience,
        })
        if (recipientError) throw recipientError
        const candidates = (recipientData ?? []) as RecipientRow[]
        let confirmedIds: string[]
        try {
          confirmedIds = await getLineGroupMemberIdsForCandidates(groupId, candidates.map((row) => row.line_user_id), channelAccessToken)
        } catch {
          const { data: rejected } = await service.rpc('reject_pickup_notification_reply_command', {
            p_command_hash: commandHash,
            p_webhook_event_id: webhookEventId,
            p_line_group_id: groupId,
            p_line_user_id: lineUserId,
            p_failure_code: 'recipients_changed',
          })
          if (rejected === true) await replyMessages(channelAccessToken, replyToken, [{ type: 'text', text: '目前無法確認通知名單，請回到團主後台重新產生指令。' }])
          continue
        }

        const recipientHash = await pickupRecipientSnapshotHash(groupId, confirmedIds)
        const eligibleHash = await pickupEligibleRecipientSnapshotHash(candidates.map((row) => row.line_user_id))
        const messageHash = await technicalSha256(message)
        let messages: LineTextV2Message[] = []
        try {
          messages = buildPickupMentionMessages(confirmedIds.map((lineUserId) => ({ lineUserId })), message)
        } catch {
          // The command is consumed below through the same safe changed-list path.
        }
        const snapshotMatches = recipientHash === command.recipient_hash
          && messageHash === command.message_hash
          && confirmedIds.length === command.recipient_count
          && messages.length === command.message_count
        if (!snapshotMatches) {
          const { data: rejected } = await service.rpc('reject_pickup_notification_reply_command', {
            p_command_hash: commandHash,
            p_webhook_event_id: webhookEventId,
            p_line_group_id: groupId,
            p_line_user_id: lineUserId,
            p_failure_code: 'recipients_changed',
          })
          if (rejected === true) await replyMessages(channelAccessToken, replyToken, [{ type: 'text', text: '通知名單已變更，請回到團主後台重新預覽並產生指令。' }])
          continue
        }

        const { data: claimed, error: claimError } = await service.rpc('claim_pickup_notification_reply_command', {
          p_command_hash: commandHash,
          p_webhook_event_id: webhookEventId,
          p_line_group_id: groupId,
          p_line_user_id: lineUserId,
          p_recipient_hash: recipientHash,
          p_eligible_hash: eligibleHash,
          p_message_hash: messageHash,
        })
        if (claimError) throw claimError
        if (claimed !== true) continue

        const lineResult = await replyMessages(channelAccessToken, replyToken, messages)
        const completion = lineResult.ok
          ? await service.rpc('complete_pickup_notification_reply_command', {
              p_command_hash: commandHash,
              p_webhook_event_id: webhookEventId,
            })
          : await service.rpc('fail_pickup_notification_reply_command', {
              p_command_hash: commandHash,
              p_webhook_event_id: webhookEventId,
              p_failure_code: lineResult.timedOut ? 'reply_timeout' : 'reply_failed',
            })
        const { data: completed, error: completionError } = completion
        if (completionError || completed !== true) console.error('LINE pickup reply completion state failed')
        if (!lineResult.ok) console.error('LINE pickup reply failed', { status: lineResult.status, timedOut: lineResult.timedOut })
        continue
      }

      const bindingKind = messageText === TEST_BIND_COMMAND ? 'test' : messageText === PRODUCTION_BIND_COMMAND ? 'production' : null
      if (!bindingKind) continue
      const { data: result, error: processError } = await service.rpc('process_line_group_binding_event', {
        p_webhook_event_id: webhookEventId,
        p_community_id: COMMUNITY_ID,
        p_line_group_id: groupId,
        p_line_user_id: lineUserId,
        p_binding_kind: bindingKind,
      })
      if (processError) throw processError
      if (result === 'duplicate') continue
      const text = result === 'forbidden' ? '只有已核准團主可以綁定通知群組。'
        : result === 'busy' ? '這個通知槽位正在使用中，請稍後再綁定。'
        : result === 'conflict' ? '同一個LINE群組不能同時作為測試與正式通知群組。'
        : result === 'bound' ? (bindingKind === 'test' ? '測試團購通知已綁定至這個群組。' : '正式團購通知已綁定至這個群組。')
        : ''
      if (!text) throw new Error('unexpected LINE binding result')
      await replyMessages(channelAccessToken, replyToken, [{ type: 'text', text }])
    }

    return jsonResponse({ ok: true })
  } catch (error) {
    if (error instanceof SyntaxError) return jsonResponse({ error: 'LINE webhook格式錯誤' }, 400)
    console.error('line-group-webhook failed')
    return jsonResponse({ error: 'LINE webhook暫時無法使用' }, 500)
  }
})
