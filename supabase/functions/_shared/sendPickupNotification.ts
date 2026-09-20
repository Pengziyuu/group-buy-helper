import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, jsonResponse, readJsonBodyWithLimit } from './http.ts'
import {
  buildPickupMentionMessages,
  generatePickupReplyCommandCode,
  getLineGroupMemberIdsForCandidates,
  MAX_PICKUP_NOTIFICATION_RECIPIENTS,
  openPickupRecipientSnapshot,
  pickupRecipientSnapshotHash,
  sealPickupRecipientSnapshot,
  sealPickupReplyPayload,
  technicalSha256,
  type SealedPickupRecipientSnapshot,
} from './pickupNotification.ts'

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

export function createPickupNotificationHandler(destination: 'production' | 'test') {
  return async (request: Request) => {
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
      if (userError || !userData.user || userData.user.is_anonymous) return jsonResponse({ error: '團主登入已失效' }, 401)
      const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin')
      if (adminError || isAdmin !== true) return jsonResponse({ error: '需要團主權限' }, 403)
      const { data: approvedLineOrganizer, error: organizerError } = await userClient.rpc('is_approved_line_organizer')
      if (organizerError || approvedLineOrganizer !== true) return jsonResponse({ error: '需要已核准的LINE團主身分' }, 403)

      const body = await readJsonBodyWithLimit(request, 16_384)
      const action = body.action
      const campaignId = typeof body.campaignId === 'string' ? body.campaignId : ''
      const audience = body.audience
      const message = typeof body.message === 'string' ? body.message : ''
      const previewToken = typeof body.previewToken === 'string' ? body.previewToken : ''
      if (action !== 'preview' && action !== 'create-command') return jsonResponse({ error: '通知動作格式錯誤' }, 400)
      if (!UUID.test(campaignId)) return jsonResponse({ error: '團購識別格式錯誤' }, 400)
      if (audience !== 'phase13' && audience !== 'phase2') return jsonResponse({ error: '通知期別格式錯誤' }, 400)
      if (destination === 'test' && !message.startsWith('【測試】\n')) return jsonResponse({ error: '測試通知必須保留【測試】前綴' }, 400)

      const channelAccessToken = Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') ?? ''
      const intentSecret = Deno.env.get('PICKUP_NOTIFICATION_INTENT_SECRET') ?? ''
      if (!channelAccessToken) return jsonResponse({ error: 'LINE通知服務尚未設定' }, 503)
      if (intentSecret.length < 32) return jsonResponse({ error: 'LINE通知預覽加密尚未設定' }, 503)

      let sealedSnapshot: SealedPickupRecipientSnapshot | null = null
      if (action === 'create-command') {
        try {
          sealedSnapshot = await openPickupRecipientSnapshot(intentSecret, previewToken)
          if (sealedSnapshot.destination !== destination) throw new Error('destination mismatch')
        } catch {
          return jsonResponse({ error: '預覽憑證無效，請重新預覽' }, 409)
        }
      }

      const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
      const { data: testMarker, error: markerError } = await service.from('pickup_notification_test_campaign')
        .select('campaign_id').eq('campaign_id', campaignId).maybeSingle()
      if (markerError) throw markerError
      if ((destination === 'test') !== Boolean(testMarker?.campaign_id)) {
        return jsonResponse({ error: destination === 'test' ? '此團購尚未加入通知測試中心' : '測試團購不能從正式介面產生指令' }, 409)
      }

      const callerHash = await technicalSha256(`pickup-caller:${userData.user.id}`)
      let reservedToken: string | null = null
      let groupId = sealedSnapshot?.groupId ?? ''
      if (action === 'preview') {
        const { data: reservation, error: reservationError } = await service.rpc('reserve_pickup_notification_intent', {
          p_campaign_id: campaignId,
          p_audience: audience,
          p_community_id: COMMUNITY_ID,
          p_caller_user_id: userData.user.id,
          p_caller_hash: callerHash,
          p_binding_kind: destination,
        }).single()
        if (reservationError) {
          if (reservationError.message.includes('rate limited')) return jsonResponse({ error: '預覽次數過於頻繁，請稍後再試' }, 429)
          if (reservationError.message.includes('group not bound')) return jsonResponse({ error: '尚未綁定LINE通知群組' }, 409)
          if (reservationError.message.includes('campaign must be closed')) return jsonResponse({ error: '團購結單後才能發送領取通知' }, 409)
          if (reservationError.message.includes('approved LINE organizer')) return jsonResponse({ error: '需要已核准的LINE團主身分' }, 403)
          throw reservationError
        }
        reservedToken = reservation.token
        groupId = reservation.line_group_id
      } else {
        const { data: group, error: groupError } = await service.from('community_line_group')
          .select('line_group_id').eq('community_id', COMMUNITY_ID).eq('binding_kind', destination).maybeSingle()
        if (groupError) throw groupError
        if (!group?.line_group_id) return jsonResponse({ error: '尚未綁定LINE通知群組' }, 409)
        if (group.line_group_id !== groupId) return jsonResponse({ error: '通知名單或群組已變更，請重新預覽' }, 409)
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
          p_binding_kind: destination,
          p_recipient_hash: '0'.repeat(64),
          p_recipient_count: 0,
          p_message_count: 0,
        })
      }

      try {
        const { data: recipientsData, error: recipientsError } = await service.rpc('internal_pickup_notification_recipients', {
          p_campaign_id: campaignId,
          p_audience: audience,
        })
        if (recipientsError) {
          await cancelReservation()
          if (recipientsError.message.includes('campaign must be closed')) return jsonResponse({ error: '團購結單後才能發送領取通知' }, 409)
          if (recipientsError.message.includes('campaign not found')) return jsonResponse({ error: '找不到團購' }, 404)
          throw recipientsError
        }
        const recipients = (recipientsData ?? []) as RecipientRow[]
        const confirmedIds = new Set(await getLineGroupMemberIdsForCandidates(
          groupId,
          recipients.map((recipient) => recipient.line_user_id),
          channelAccessToken,
        ))
        const mentionable = recipients.filter((recipient) => confirmedIds.has(recipient.line_user_id))
        const unavailable = recipients.filter((recipient) => !confirmedIds.has(recipient.line_user_id))
        if (mentionable.length > MAX_PICKUP_NOTIFICATION_RECIPIENTS) {
          await cancelReservation()
          return jsonResponse({ error: `單次最多可＠${MAX_PICKUP_NOTIFICATION_RECIPIENTS}位住戶` }, 409)
        }
        const messages = mentionable.length > 0
          ? buildPickupMentionMessages(mentionable.map((recipient) => ({ lineUserId: recipient.line_user_id })), message)
          : []
        const recipientHash = await pickupRecipientSnapshotHash(groupId, mentionable.map((recipient) => recipient.line_user_id))

        if (action === 'preview') {
          const finalizedToken = reservedToken
          const { data: finalized, error: finalizeError } = await service.rpc('finalize_pickup_notification_intent', {
            p_token: finalizedToken,
            p_campaign_id: campaignId,
            p_audience: audience,
            p_caller_hash: callerHash,
            p_binding_kind: destination,
            p_recipient_hash: recipientHash,
            p_recipient_count: mentionable.length,
            p_message_count: messages.length,
          })
          if (finalizeError) throw finalizeError
          reservedToken = null
          const responsePreviewToken = finalized === true && finalizedToken
            ? await sealPickupRecipientSnapshot(intentSecret, finalizedToken, destination, groupId, mentionable.map((recipient) => recipient.line_user_id))
            : null
          return jsonResponse({
            previewToken: responsePreviewToken,
            mentionableRecipients: mentionable.map(publicRecipient),
            unavailableRecipients: unavailable.map(publicRecipient),
            mentionableCount: mentionable.length,
            messageCount: messages.length,
          })
        }

        if (!sealedSnapshot || messages.length === 0) return jsonResponse({ error: '目前沒有可在群組＠的購買者' }, 409)
        const sealedHash = await pickupRecipientSnapshotHash(sealedSnapshot.groupId, sealedSnapshot.lineUserIds)
        if (sealedHash !== recipientHash) return jsonResponse({ error: '通知名單已變更，請重新預覽' }, 409)

        const commandCode = generatePickupReplyCommandCode(destination)
        const commandHash = await technicalSha256(`pickup-command:${commandCode}`)
        const payloadCiphertext = await sealPickupReplyPayload(intentSecret, sealedSnapshot.intentId, message)
        const messageHash = await technicalSha256(message)
        const { data: issued, error: issueError } = await service.rpc('issue_pickup_notification_reply_command', {
          p_token: sealedSnapshot.intentId,
          p_campaign_id: campaignId,
          p_audience: audience,
          p_caller_user_id: userData.user.id,
          p_caller_hash: callerHash,
          p_binding_kind: destination,
          p_command_hash: commandHash,
          p_payload_ciphertext: payloadCiphertext,
          p_message_hash: messageHash,
        }).single()
        if (issueError) {
          if (issueError.message.includes('preview')) return jsonResponse({ error: '預覽已失效，請重新預覽' }, 409)
          if (issueError.message.includes('environment')) return jsonResponse({ error: '通知名單或群組已變更，請重新預覽' }, 409)
          if (issueError.message.includes('approved LINE organizer')) return jsonResponse({ error: '需要已核准的LINE團主身分' }, 403)
          throw issueError
        }
        return jsonResponse({
          status: 'awaiting_group_command',
          command: `${destination === 'test' ? '測試領取通知' : '發送領取通知'} ${commandCode}`,
          expiresAt: issued.expires_at,
          mentionableCount: issued.recipient_count,
          messageCount: issued.message_count,
        })
      } catch (error) {
        await cancelReservation()
        throw error
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message === '請求內容過大') return jsonResponse({ error: message }, 413)
      if (message.includes('通知內容') || message.includes('沒有可＠') || message.includes('LINE住戶')) return jsonResponse({ error: message }, 400)
      if (message.startsWith('無法確認LINE群組成員') || message.startsWith('LINE群組成員')) {
        return jsonResponse({ error: '無法確認購買者是否仍在LINE群組，請檢查官方帳號與群組設定' }, 502)
      }
      console.error('pickup notification command failed')
      return jsonResponse({ error: '領取通知服務暫時無法使用' }, 500)
    }
  }
}
