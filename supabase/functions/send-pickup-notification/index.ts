import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, jsonResponse, readJsonBodyWithLimit } from '../_shared/http.ts'
import {
  buildPickupMentionMessages,
  getLineGroupMemberIdsForCandidates,
  MAX_PICKUP_NOTIFICATION_RECIPIENTS,
  openPickupRecipientSnapshot,
  pickupEligibleRecipientSnapshotHash,
  pickupRecipientSnapshotHash,
  sealPickupRecipientSnapshot,
  technicalSha256,
  type LineTextV2Message,
  type SealedPickupRecipientSnapshot,
} from '../_shared/pickupNotification.ts'

const COMMUNITY_ID = '00000000-0000-4000-8000-000000000001'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RecipientRow = {
  line_user_id: string
  member_code: string
  display_name: string
  picture_url: string | null
  period: number
  unit: string
  paid: boolean
}

type IntentClaim = {
  line_retry_key: string
  delivery_status: 'sending' | 'sent'
  recipient_count: number
  message_count: number
}

type IntentState = {
  delivery_status: 'preparing' | 'ready' | 'sending' | 'sent'
  recipient_count: number | null
  message_count: number | null
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
}

function publicRecipient(recipient: RecipientRow) {
  return {
    memberCode: recipient.member_code,
    displayName: recipient.display_name,
    pictureUrl: recipient.picture_url,
    period: recipient.period,
    unit: recipient.unit,
    paid: recipient.paid,
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: '只接受 POST' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const token = bearerToken(request)
    if (!token) return jsonResponse({ error: '需要團主登入' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: 'Bearer ' + token } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError || !userData.user || userData.user.is_anonymous) {
      return jsonResponse({ error: '團主登入已失效' }, 401)
    }
    const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin')
    if (adminError || isAdmin !== true) return jsonResponse({ error: '需要團主權限' }, 403)
    const { data: approvedLineOrganizer, error: lineOrganizerError } = await userClient
      .rpc('is_approved_line_organizer')
    if (lineOrganizerError || approvedLineOrganizer !== true) {
      return jsonResponse({ error: '需要已核准的LINE團主身分' }, 403)
    }

    const body = await readJsonBodyWithLimit(request, 16_384)
    const action = body.action
    const campaignId = typeof body.campaignId === 'string' ? body.campaignId : ''
    const audience = body.audience
    const message = typeof body.message === 'string' ? body.message : ''
    const previewToken = typeof body.previewToken === 'string' ? body.previewToken : ''
    if (action !== 'preview' && action !== 'send') return jsonResponse({ error: '通知動作格式錯誤' }, 400)
    if (!UUID.test(campaignId)) return jsonResponse({ error: '團購識別格式錯誤' }, 400)
    if (audience !== 'phase13' && audience !== 'phase2') return jsonResponse({ error: '通知期別格式錯誤' }, 400)

    const channelAccessToken = Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') ?? ''
    const intentSecret = Deno.env.get('PICKUP_NOTIFICATION_INTENT_SECRET') ?? ''
    if (!channelAccessToken) return jsonResponse({ error: 'LINE通知服務尚未設定' }, 503)
    if (intentSecret.length < 32) return jsonResponse({ error: 'LINE通知預覽加密尚未設定' }, 503)

    let sealedSnapshot: SealedPickupRecipientSnapshot | null = null
    if (action === 'send') {
      try {
        sealedSnapshot = await openPickupRecipientSnapshot(intentSecret, previewToken)
      } catch {
        return jsonResponse({ error: '預覽憑證無效，請重新預覽' }, 409)
      }
    }
    const intentId = sealedSnapshot?.intentId ?? ''

    const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const callerHash = await technicalSha256(`pickup-caller:${userData.user.id}`)
    let intentState: IntentState | null = null
    if (action === 'send') {
      const { data: stateData, error: stateError } = await service
        .rpc('inspect_pickup_notification_intent', {
          p_token: intentId,
          p_campaign_id: campaignId,
          p_audience: audience,
          p_caller_user_id: userData.user.id,
          p_caller_hash: callerHash,
        })
        .maybeSingle()
      if (stateError) {
        if (stateError.message.includes('approved LINE organizer')) {
          return jsonResponse({ error: '需要已核准的LINE團主身分' }, 403)
        }
        throw stateError
      }
      if (!stateData) return jsonResponse({ error: '預覽已失效，請重新預覽' }, 409)
      intentState = stateData as IntentState
      if (intentState.delivery_status === 'sent') {
        return jsonResponse({
          sent: true,
          previewToken,
          mentionableRecipients: [],
          unavailableRecipients: [],
          mentionableCount: intentState.recipient_count ?? 0,
          messageCount: intentState.message_count ?? 0,
        })
      }
    }

    let reservedToken: string | null = null
    let groupId = ''
    if (action === 'preview') {
      const { data: reservation, error: reservationError } = await service
        .rpc('reserve_pickup_notification_intent', {
          p_campaign_id: campaignId,
          p_audience: audience,
          p_community_id: COMMUNITY_ID,
          p_caller_user_id: userData.user.id,
          p_caller_hash: callerHash,
        })
        .single()
      if (reservationError) {
        if (reservationError.message.includes('rate limited')) return jsonResponse({ error: '預覽次數過於頻繁，請稍後再試' }, 429)
        if (reservationError.message.includes('group not bound')) return jsonResponse({ error: '尚未綁定LINE通知群組' }, 409)
        if (reservationError.message.includes('campaign must be closed')) return jsonResponse({ error: '團購結單後才能發送領取通知' }, 409)
        if (reservationError.message.includes('approved LINE organizer')) return jsonResponse({ error: '需要已核准的LINE團主身分' }, 403)
        throw reservationError
      }
      reservedToken = reservation.token
      groupId = reservation.line_group_id
    } else if (intentState?.delivery_status === 'sending' && sealedSnapshot) {
      groupId = sealedSnapshot.groupId
    } else {
      const { data: group, error: groupError } = await service
        .from('community_line_group')
        .select('line_group_id')
        .eq('community_id', COMMUNITY_ID)
        .maybeSingle()
      if (groupError) throw groupError
      if (!group?.line_group_id) return jsonResponse({ error: '尚未綁定LINE通知群組' }, 409)
      groupId = group.line_group_id
    }

    const cancelReservation = async () => {
      if (!reservedToken) return
      const tokenToCancel = reservedToken
      reservedToken = null
      await service.rpc('finalize_pickup_notification_intent', {
        p_token: tokenToCancel,
        p_campaign_id: campaignId,
        p_audience: audience,
        p_caller_hash: callerHash,
        p_recipient_hash: '0'.repeat(64),
        p_recipient_count: 0,
        p_message_count: 0,
      })
    }

    try {
      let mentionable: RecipientRow[] = []
      let unavailable: RecipientRow[] = []
      let messages: LineTextV2Message[] = []
      let recipientHash = ''
      let eligibleHash = ''

      if (action === 'send' && intentState?.delivery_status === 'sending' && sealedSnapshot) {
        messages = buildPickupMentionMessages(
          sealedSnapshot.lineUserIds.map((lineUserId) => ({ lineUserId })),
          message,
        )
        recipientHash = await pickupRecipientSnapshotHash(sealedSnapshot.groupId, sealedSnapshot.lineUserIds)
        eligibleHash = recipientHash
      } else {
        const { data: recipientsData, error: recipientsError } = await service
          .rpc('internal_pickup_notification_recipients', {
            p_campaign_id: campaignId,
            p_audience: audience,
          })
        if (recipientsError) {
          if (recipientsError.message.includes('campaign must be closed')) {
            await cancelReservation()
            return jsonResponse({ error: '團購結單後才能發送領取通知' }, 409)
          }
          if (recipientsError.message.includes('campaign not found')) {
            await cancelReservation()
            return jsonResponse({ error: '找不到團購' }, 404)
          }
          throw recipientsError
        }
        const recipients = (recipientsData ?? []) as RecipientRow[]
        eligibleHash = await pickupEligibleRecipientSnapshotHash(
          recipients.map((recipient) => recipient.line_user_id),
        )
        const confirmedMemberIds = new Set(await getLineGroupMemberIdsForCandidates(
          groupId,
          recipients.map((recipient) => recipient.line_user_id),
          channelAccessToken,
        ))
        mentionable = recipients.filter((recipient) => confirmedMemberIds.has(recipient.line_user_id))
        unavailable = recipients.filter((recipient) => !confirmedMemberIds.has(recipient.line_user_id))
        if (mentionable.length > MAX_PICKUP_NOTIFICATION_RECIPIENTS) {
          await cancelReservation()
          return jsonResponse({ error: `單次最多可＠${MAX_PICKUP_NOTIFICATION_RECIPIENTS}位住戶` }, 409)
        }
        messages = mentionable.length > 0 ? buildPickupMentionMessages(
          mentionable.map((recipient) => ({ lineUserId: recipient.line_user_id })),
          message,
        ) : []
        recipientHash = await pickupRecipientSnapshotHash(
          groupId,
          mentionable.map((recipient) => recipient.line_user_id),
        )
        if (action === 'send' && sealedSnapshot) {
          const sealedHash = await pickupRecipientSnapshotHash(sealedSnapshot.groupId, sealedSnapshot.lineUserIds)
          if (sealedHash !== recipientHash) return jsonResponse({ error: '通知名單已變更，請重新預覽' }, 409)
        }
      }

      let responsePreviewToken: string | null = null
      if (action === 'preview') {
        const finalizedToken = reservedToken
        const { data: finalized, error: finalizeError } = await service
          .rpc('finalize_pickup_notification_intent', {
            p_token: finalizedToken,
            p_campaign_id: campaignId,
            p_audience: audience,
            p_caller_hash: callerHash,
            p_recipient_hash: recipientHash,
            p_recipient_count: mentionable.length,
            p_message_count: messages.length,
          })
        if (finalizeError) throw finalizeError
        reservedToken = null
        if (finalized === true && finalizedToken) {
          responsePreviewToken = await sealPickupRecipientSnapshot(
            intentSecret,
            finalizedToken,
            groupId,
            mentionable.map((recipient) => recipient.line_user_id),
          )
        }
      }

      if (action === 'send') {
        if (!sealedSnapshot || messages.length === 0) return jsonResponse({ error: '沒有目前可在群組＠的購買者' }, 409)
        const messageHash = await technicalSha256(message.trim())
        const { data: claimedData, error: claimError } = await service
          .rpc('claim_pickup_notification_intent', {
            p_token: sealedSnapshot.intentId,
            p_campaign_id: campaignId,
            p_audience: audience,
            p_recipient_hash: recipientHash,
            p_eligible_hash: eligibleHash,
            p_line_group_id: groupId,
            p_caller_user_id: userData.user.id,
            p_caller_hash: callerHash,
            p_message_hash: messageHash,
          })
          .single()
        if (claimError) {
          if (claimError.message.includes('recipients changed') || claimError.message.includes('snapshot changed')) {
            return jsonResponse({ error: '通知名單或群組已變更，請重新預覽' }, 409)
          }
          if (claimError.message.includes('message changed')) return jsonResponse({ error: '重試時通知內容不可變更，請重新預覽' }, 409)
          if (claimError.message.includes('approved LINE organizer')) return jsonResponse({ error: '需要已核准的LINE團主身分' }, 403)
          if (claimError.message.includes('preview')) return jsonResponse({ error: '預覽已失效，請重新預覽' }, 409)
          if (claimError.message.includes('campaign must be closed')) return jsonResponse({ error: '團購結單後才能發送領取通知' }, 409)
          throw claimError
        }
        const intent = claimedData as IntentClaim
        let lineResponse: Response
        try {
          lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + channelAccessToken,
              'Content-Type': 'application/json',
              'X-Line-Retry-Key': intent.line_retry_key,
            },
            body: JSON.stringify({ to: groupId, messages }),
            signal: AbortSignal.timeout(10_000),
          })
        } catch {
          return jsonResponse({ error: 'LINE回應逾時；可使用相同預覽內容安全重試' }, 504)
        }
        const alreadyAccepted = lineResponse.status === 409
          && Boolean(lineResponse.headers.get('x-line-accepted-request-id'))
        if (!lineResponse.ok && !alreadyAccepted) {
          console.error('LINE pickup push failed', { status: lineResponse.status })
          if (lineResponse.status === 429) return jsonResponse({ error: 'LINE訊息額度或頻率已達限制，請稍後重試' }, 429)
          if (lineResponse.status === 401 || lineResponse.status === 403) return jsonResponse({ error: 'LINE通知憑證或帳號權限錯誤' }, 502)
          return jsonResponse({ error: 'LINE領取通知發送失敗；可使用相同預覽內容安全重試' }, 502)
        }
        const { data: marked, error: markError } = await service
          .rpc('mark_pickup_notification_intent_sent', {
            p_token: sealedSnapshot.intentId,
            p_campaign_id: campaignId,
            p_audience: audience,
            p_caller_hash: callerHash,
          })
        if (markError || marked !== true) {
          console.error('LINE pickup intent completion update failed')
          return jsonResponse({ error: 'LINE已接受通知，但完成狀態暫時無法確認；請使用相同預覽安全重試' }, 503)
        }
        responsePreviewToken = previewToken
      }

      return jsonResponse({
        sent: action === 'send',
        previewToken: responsePreviewToken,
        mentionableRecipients: mentionable.map(publicRecipient),
        unavailableRecipients: unavailable.map(publicRecipient),
        mentionableCount: action === 'send' && intentState?.delivery_status === 'sending'
          ? intentState.recipient_count ?? 0
          : mentionable.length,
        messageCount: messages.length,
      })
    } catch (error) {
      await cancelReservation()
      throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === '請求內容過大') return jsonResponse({ error: message }, 413)
    if (message.includes('通知內容') || message.includes('沒有可＠') || message.includes('LINE住戶')) {
      return jsonResponse({ error: message }, 400)
    }
    if (message.startsWith('無法確認LINE群組成員') || message.startsWith('LINE群組成員')) {
      return jsonResponse({ error: '無法確認購買者是否仍在LINE群組，請檢查官方帳號與群組設定' }, 502)
    }
    console.error('send-pickup-notification failed', error)
    return jsonResponse({ error: '領取通知服務暫時無法使用' }, 500)
  }
})
