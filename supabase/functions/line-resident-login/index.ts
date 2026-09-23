import { createClient } from 'npm:@supabase/supabase-js@2'
import { clientAddress, corsHeaders, jsonResponse, readJsonBodyWithLimit } from '../_shared/http.ts'
import { lineVerificationPublicMessage, verifyLineIdToken } from '../_shared/line.ts'
import { enforceLineLoginRateLimit } from '../_shared/lineRateLimit.ts'
import { selectLineResidentAuthUserId } from '../_shared/policies.ts'
import { checkResidentGroupMemberships } from '../_shared/residentGroupMembership.ts'

type AdminClient = ReturnType<typeof createClient>

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function internalResidentEmail(subject: string, pepper: string): Promise<string> {
  if (!pepper) throw new Error('住戶登入帳號設定缺失')
  return `line-resident-${await sha256(`${pepper}:${subject}`)}@users.invalid`
}

async function existingUserByEmail(admin: AdminClient, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data.user?.id) return null
  return data.user
}

async function getOrCreateResidentUser(admin: AdminClient, email: string) {
  const existing = await existingUserByEmail(admin, email)
  if (existing) return existing

  const password = `${crypto.randomUUID()}-${crypto.randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (!error && data.user?.id) return data.user

  // A concurrent request or a response-loss retry may have created the user.
  const reconciled = await existingUserByEmail(admin, email)
  if (reconciled) return reconciled
  throw error ?? new Error('無法建立住戶登入帳號')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: '只接受 POST' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const lineChannelId = Deno.env.get('LINE_CHANNEL_ID')!
    const rateLimitPepper = Deno.env.get('LINE_RATE_LIMIT_PEPPER')!
    const emailPepper = Deno.env.get('LINE_RESIDENT_EMAIL_PEPPER')!
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const body = await readJsonBodyWithLimit(request, 16_384)
    const idToken = typeof body.idToken === 'string' ? body.idToken : ''
    if (!idToken) return jsonResponse({ error: '缺少 LINE ID token' }, 400)
    if (idToken.length > 8_192) return jsonResponse({ error: 'LINE ID token 格式錯誤' }, 400)

    await enforceLineLoginRateLimit(admin, clientAddress(request), rateLimitPepper)
    const lineIdentity = await verifyLineIdToken(idToken, lineChannelId)
    const communityId = '00000000-0000-4000-8000-000000000001'
    const { data: block, error: blockError } = await admin.from('community_resident_block')
      .select('line_user_id').eq('community_id', communityId).eq('line_user_id', lineIdentity.subject).maybeSingle()
    if (blockError) throw blockError
    if (block) throw new Error('resident blocked')
    // Identity/Auth/customer existence is NOT proof of prior admission.
    const { data: admission, error: admissionError } = await admin.from('community_resident_admission')
      .select('line_user_id').eq('community_id', communityId).eq('line_user_id', lineIdentity.subject).maybeSingle()
    if (admissionError) throw admissionError
    let groupId: string | null = null
    let bindingRevision: string | null = null
    let groupCheckedAt: string | null = null
    if (!admission) {
      const { data: binding, error: bindingError } = await admin.from('community_line_group')
        .select('line_group_id,binding_revision').eq('community_id', communityId).eq('binding_kind', 'production').maybeSingle()
      if (bindingError) throw new Error('GROUP_MEMBERSHIP_UNAVAILABLE')
      const [status] = await checkResidentGroupMemberships(binding?.line_group_id ?? '', [lineIdentity.subject],
        Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') ?? '')
      if (status === 'not_in_group') return jsonResponse({ code: 'GROUP_MEMBERSHIP_REQUIRED', error: '請先加入社區團購群組，才能使用團購系統' }, 403)
      if (status !== 'in_group' || !binding?.binding_revision) throw new Error('GROUP_MEMBERSHIP_UNAVAILABLE')
      groupId = binding.line_group_id
      bindingRevision = binding.binding_revision
      groupCheckedAt = new Date().toISOString()
    }

    const [organizerResult, residentResult] = await Promise.all([
      admin.from('line_organizer_identity')
        .select('auth_user_id')
        .eq('line_user_id', lineIdentity.subject)
        .maybeSingle(),
      admin.from('line_resident_identity')
        .select('auth_user_id')
        .eq('line_user_id', lineIdentity.subject)
        .maybeSingle(),
    ])
    if (organizerResult.error) throw organizerResult.error
    if (residentResult.error) throw residentResult.error

    let authUserId = selectLineResidentAuthUserId(
      organizerResult.data?.auth_user_id ?? null,
      residentResult.data?.auth_user_id ?? null,
    )
    let authEmail: string
    if (authUserId) {
      const { data, error } = await admin.auth.admin.getUserById(authUserId)
      if (error || !data.user?.email) throw error ?? new Error('LINE住戶Auth帳號不存在')
      authEmail = data.user.email
    } else {
      authEmail = await internalResidentEmail(lineIdentity.subject, emailPepper)
      const user = await getOrCreateResidentUser(admin, authEmail)
      authUserId = user.id
    }

    const { error: provisionError } = await admin.rpc('provision_line_resident', {
      p_line_user_id: lineIdentity.subject,
      p_auth_user_id: authUserId,
      p_display_name: lineIdentity.displayName,
      p_picture_url: lineIdentity.pictureUrl,
      p_group_id: groupId,
      p_binding_revision: bindingRevision,
      p_group_checked_at: groupCheckedAt,
    })
    if (provisionError) {
      if (provisionError.message.includes('GROUP_MEMBERSHIP_UNAVAILABLE')) throw new Error('GROUP_MEMBERSHIP_UNAVAILABLE')
      throw provisionError
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
    })
    if (linkError || !link.properties?.hashed_token) {
      throw linkError ?? new Error('無法建立一次性登入憑證')
    }

    return jsonResponse({
      status: 'approved',
      tokenHash: link.properties.hashed_token,
      verificationType: 'email',
      displayName: lineIdentity.displayName,
      pictureUrl: lineIdentity.pictureUrl,
    })
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : ''
    if (message === 'GROUP_MEMBERSHIP_UNAVAILABLE') return jsonResponse({ code: 'GROUP_MEMBERSHIP_UNAVAILABLE', error: '目前無法確認群組資格，請稍後再試或聯繫團主' }, 503)
    if (message === '請求內容過大') return jsonResponse({ error: message }, 413)
    if (message.includes('嘗試過多')) return jsonResponse({ error: message }, 429)
    if (message === '無法識別請求來源' || message === 'JSON格式錯誤') {
      return jsonResponse({ error: '請求格式錯誤' }, 400)
    }
    const lineError = lineVerificationPublicMessage(error)
    if (lineError) return jsonResponse({ error: lineError }, 401)
    if (message.includes('resident blocked')) return jsonResponse({ error: '此LINE帳號已被團主移除' }, 403)
    console.error('line-resident-login failed')
    return jsonResponse({ error: '住戶登入服務暫時無法使用' }, 500)
  }
})
