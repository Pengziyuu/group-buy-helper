import { createClient } from 'npm:@supabase/supabase-js@2'
import { clientAddress, corsHeaders, jsonResponse, readJsonBodyWithLimit } from '../_shared/http.ts'
import { lineVerificationPublicMessage, verifyLineIdToken } from '../_shared/line.ts'
import { enforceLineLoginRateLimit } from '../_shared/lineRateLimit.ts'
import { assertOrganizerBinding } from '../_shared/policies.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: '只接受 POST' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const lineChannelId = Deno.env.get('LINE_CHANNEL_ID')!
    const rateLimitPepper = Deno.env.get('LINE_RATE_LIMIT_PEPPER')!
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const body = await readJsonBodyWithLimit(request, 16_384)
    const idToken = typeof body.idToken === 'string' ? body.idToken : ''
    if (!idToken) return jsonResponse({ error: '缺少 LINE ID token' }, 400)
    if (idToken.length > 8_192) return jsonResponse({ error: 'LINE ID token 格式錯誤' }, 400)

    await enforceLineLoginRateLimit(admin, clientAddress(request), rateLimitPepper)
    const lineIdentity = await verifyLineIdToken(idToken, lineChannelId)
    const { data: binding, error: bindingError } = await admin
      .from('line_organizer_identity')
      .select('auth_user_id')
      .eq('line_user_id', lineIdentity.subject)
      .maybeSingle()
    if (bindingError) throw bindingError

    if (!binding) {
      const { data: pending, error: requestError } = await admin
        .from('line_organizer_request')
        .upsert({
          line_user_id: lineIdentity.subject,
          display_name: lineIdentity.displayName,
          picture_url: lineIdentity.pictureUrl,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'line_user_id' })
        .select('request_code')
        .single()
      if (requestError) throw requestError
      return jsonResponse({
        status: 'pending',
        requestCode: pending.request_code,
        displayName: lineIdentity.displayName,
      })
    }

    const { data: membership, error: membershipError } = await admin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', binding.auth_user_id)
      .maybeSingle()
    if (membershipError) throw membershipError
    const authUserId = assertOrganizerBinding(binding.auth_user_id, membership?.user_id ?? null)

    const { data: authUser, error: userError } = await admin.auth.admin.getUserById(authUserId)
    if (userError || !authUser.user?.email) throw userError ?? new Error('團主Auth帳號不存在')
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.user.email,
    })
    if (linkError || !link.properties?.hashed_token) {
      throw linkError ?? new Error('無法建立一次性登入憑證')
    }

    return jsonResponse({
      status: 'approved',
      tokenHash: link.properties.hashed_token,
      verificationType: 'email',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === '請求內容過大') return jsonResponse({ error: message }, 413)
    if (message.includes('嘗試過多')) return jsonResponse({ error: message }, 429)
    if (message === '無法識別請求來源' || message === 'JSON格式錯誤') {
      return jsonResponse({ error: '請求格式錯誤' }, 400)
    }
    const lineError = lineVerificationPublicMessage(error)
    if (lineError) return jsonResponse({ error: lineError }, 401)
    console.error('line-organizer-login failed', error)
    return jsonResponse({ error: '登入服務暫時無法使用' }, 500)
  }
})
