import { createClient } from 'npm:@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/http.ts'

type ClaimedNotification = {
  notification_id: string
  recipient_line_user_id: string
  message_text: string
  line_retry_key: string
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

export async function timingSafeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)])
  let difference = left.length === right.length ? 0 : 1
  for (let index = 0; index < leftHash.length; index += 1) difference |= leftHash[index] ^ rightHash[index]
  return difference === 0
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: '只接受 POST' }, 405)

  const cronSecret = Deno.env.get('AUTO_CLOSE_NOTIFICATION_CRON_SECRET') ?? ''
  const providedSecret = request.headers.get('x-auto-close-cron-secret') ?? ''
  if (cronSecret.length < 32 || !await timingSafeEqual(cronSecret, providedSecret)) {
    return jsonResponse({ error: '未授權的排程請求' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const channelAccessToken = Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') ?? ''
  if (!supabaseUrl || !serviceRoleKey || !channelAccessToken) {
    return jsonResponse({ error: '自動結單通知服務尚未設定' }, 503)
  }

  try {
    const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const { data, error } = await service.rpc('claim_campaign_auto_close_notifications', { p_limit: 10 })
    if (error) throw error
    const notifications = (data ?? []) as ClaimedNotification[]
    let sent = 0
    let retrying = 0
    let failed = 0

    for (const notification of notifications) {
      let response: Response | null = null
      let failureCode = 'timeout'
      let retryable = true
      try {
        response = await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${channelAccessToken}`,
            'Content-Type': 'application/json',
            'X-Line-Retry-Key': notification.line_retry_key,
          },
          body: JSON.stringify({
            to: notification.recipient_line_user_id,
            messages: [{ type: 'text', text: notification.message_text }],
          }),
          signal: AbortSignal.timeout(10_000),
        })
      } catch {
        response = null
      }

      const accepted = response?.ok === true
        || (response !== null && response.status === 409 && response.headers.has('x-line-accepted-request-id'))
      if (accepted) {
        const { data: completed, error: completionError } = await service.rpc(
          'complete_campaign_auto_close_notification',
          {
            p_notification_id: notification.notification_id,
            p_line_retry_key: notification.line_retry_key,
          },
        )
        if (completionError || completed !== true) {
          console.error('auto-close notification completion failed')
          const { data: rescheduled } = await service.rpc('fail_campaign_auto_close_notification', {
            p_notification_id: notification.notification_id,
            p_line_retry_key: notification.line_retry_key,
            p_retryable: true,
            p_failure_code: 'completion_failed',
          })
          if (rescheduled === true) retrying += 1
          else failed += 1
        } else sent += 1
        continue
      }

      if (response) {
        retryable = response.status === 429 || response.status >= 500
        failureCode = response.status === 429
          ? 'rate_limited'
          : response.status >= 500
            ? 'line_server_error'
            : 'line_rejected'
      }
      const { data: failureRecorded, error: failureError } = await service.rpc(
        'fail_campaign_auto_close_notification',
        {
          p_notification_id: notification.notification_id,
          p_line_retry_key: notification.line_retry_key,
          p_retryable: retryable,
          p_failure_code: failureCode,
        },
      )
      if (failureError || failureRecorded !== true) console.error('auto-close notification failure state failed')
      if (retryable) retrying += 1
      else failed += 1
    }

    return jsonResponse({ ok: true, processed: notifications.length, sent, retrying, failed })
  } catch {
    console.error('send-auto-close-organizer-notifications failed')
    return jsonResponse({ error: '自動結單通知暫時無法處理' }, 500)
  }
})
