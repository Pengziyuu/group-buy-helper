import { createClient } from 'npm:@supabase/supabase-js@2'
import { clientAddress, corsHeaders, jsonResponse, readJsonBodyWithLimit } from '../_shared/http.ts'
import { verifyLineIdToken } from '../_shared/line.ts'
import { enforceLineLoginRateLimit } from '../_shared/lineRateLimit.ts'
import { selectLineResidentAuthUserId } from '../_shared/policies.ts'

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
    const inviteSlug = typeof body.inviteSlug === 'string' ? body.inviteSlug : ''
    if (!idToken) return jsonResponse({ error: '缺少 LINE ID token' }, 400)
    if (idToken.length > 8_192) return jsonResponse({ error: 'LINE ID token 格式錯誤' }, 400)
    if (!/^[0-9a-f]{36}$/.test(inviteSlug)) return jsonResponse({ error: '社區邀請連結無效' }, 403)

    await enforceLineLoginRateLimit(admin, clientAddress(request), rateLimitPepper)
    const lineIdentity = await verifyLineIdToken(idToken, lineChannelId)

    const { data: community, error: communityError } = await admin
      .from('community')
      .select('id')
      .eq('invite_slug', inviteSlug)
      .eq('active', true)
      .maybeSingle()
    if (communityError) throw communityError
    if (!community) return jsonResponse({ error: '社區邀請連結無效' }, 403)

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
      p_invite_slug: inviteSlug,
    })
    if (provisionError) throw provisionError

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
    const message = error instanceof Error ? error.message : ''
    if (message === '請求內容過大') return jsonResponse({ error: message }, 413)
    if (message.includes('嘗試過多')) return jsonResponse({ error: message }, 429)
    if (message === '無法識別請求來源' || message === 'JSON格式錯誤') {
      return jsonResponse({ error: '請求格式錯誤' }, 400)
    }
    if (message.startsWith('LINE ')) return jsonResponse({ error: 'LINE身分驗證失敗' }, 401)
    if (message.includes('邀請')) return jsonResponse({ error: '社區邀請連結無效' }, 403)
    console.error('line-resident-login failed', error)
    return jsonResponse({ error: '住戶登入服務暫時無法使用' }, 500)
  }
})
