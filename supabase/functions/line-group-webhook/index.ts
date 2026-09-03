import { createClient } from 'npm:@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/http.ts'
import { verifyLineWebhookSignature } from '../_shared/pickupNotification.ts'

const COMMUNITY_ID = '00000000-0000-4000-8000-000000000001'
const TEST_BIND_COMMAND = '綁定測試團購通知'
const PRODUCTION_BIND_COMMAND = '綁定正式團購通知'

type LineWebhookEvent = {
  type?: unknown
  webhookEventId?: unknown
  timestamp?: unknown
  replyToken?: unknown
  source?: { type?: unknown; groupId?: unknown; userId?: unknown }
  message?: { type?: unknown; text?: unknown }
}

async function reply(channelAccessToken: string, replyToken: string, text: string) {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + channelAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) console.error('LINE group binding reply failed', { status: response.status })
  } catch {
    console.error('LINE group binding reply timed out')
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: '只接受 POST' }, 405)

  try {
    const channelSecret = Deno.env.get('LINE_MESSAGING_CHANNEL_SECRET') ?? ''
    const channelAccessToken = Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') ?? ''
    if (!channelSecret || !channelAccessToken) return jsonResponse({ error: 'LINE webhook尚未設定' }, 503)

    const declaredLength = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(declaredLength) && declaredLength > 65_536) return jsonResponse({ error: '請求內容過大' }, 413)
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > 65_536) return jsonResponse({ error: '請求內容過大' }, 413)
    const signature = request.headers.get('x-line-signature') ?? ''
    if (!await verifyLineWebhookSignature(rawBody, signature, channelSecret)) {
      return jsonResponse({ error: 'LINE簽章驗證失敗' }, 401)
    }

    const parsed: unknown = JSON.parse(rawBody)
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { events?: unknown }).events)) {
      return jsonResponse({ error: 'LINE webhook格式錯誤' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

    for (const event of (parsed as { events: LineWebhookEvent[] }).events) {
      const messageText = event.message?.text
      const bindingKind = messageText === TEST_BIND_COMMAND
        ? 'test'
        : messageText === PRODUCTION_BIND_COMMAND ? 'production' : null
      const isCommand = event.type === 'message'
        && event.message?.type === 'text'
        && bindingKind !== null
        && event.source?.type === 'group'
      if (!isCommand) continue

      const webhookEventId = typeof event.webhookEventId === 'string' ? event.webhookEventId : ''
      const timestamp = typeof event.timestamp === 'number' ? event.timestamp : Number.NaN
      const groupId = typeof event.source?.groupId === 'string' ? event.source.groupId : ''
      const lineUserId = typeof event.source?.userId === 'string' ? event.source.userId : ''
      const replyToken = typeof event.replyToken === 'string' ? event.replyToken : ''
      if (!webhookEventId || webhookEventId.length > 255 || !Number.isFinite(timestamp)
        || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000
        || !/^C[0-9a-f]{32}$/i.test(groupId) || !/^U[0-9a-f]{32}$/i.test(lineUserId)) continue

      const { data: result, error: processError } = await service
        .rpc('process_line_group_binding_event', {
          p_webhook_event_id: webhookEventId,
          p_community_id: COMMUNITY_ID,
          p_line_group_id: groupId,
          p_line_user_id: lineUserId,
          p_binding_kind: bindingKind,
        })
      if (processError) throw processError
      if (result === 'duplicate') continue
      if (result === 'forbidden') {
        if (replyToken) await reply(channelAccessToken, replyToken, '只有已核准團主可以綁定通知群組。')
        continue
      }
      if (result === 'busy') {
        if (replyToken) await reply(channelAccessToken, replyToken, '這個通知槽位正在發送中，請稍後再綁定。')
        continue
      }
      if (result === 'conflict') {
        if (replyToken) await reply(channelAccessToken, replyToken, '同一個LINE群組不能同時作為測試與正式通知群組。')
        continue
      }
      if (result !== 'bound') throw new Error('unexpected LINE binding result')
      if (replyToken) await reply(
        channelAccessToken,
        replyToken,
        bindingKind === 'test'
          ? '測試團購通知已綁定至這個群組。'
          : '正式團購通知已綁定至這個群組。',
      )
    }

    return jsonResponse({ ok: true })
  } catch (error) {
    if (error instanceof SyntaxError) return jsonResponse({ error: 'LINE webhook格式錯誤' }, 400)
    console.error('line-group-webhook failed', error)
    return jsonResponse({ error: 'LINE webhook暫時無法使用' }, 500)
  }
})
