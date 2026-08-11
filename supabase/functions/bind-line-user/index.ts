import { createClient } from 'npm:@supabase/supabase-js@2'
import { assertBindingAllowed } from '../_shared/policies.ts'
import { corsHeaders, jsonResponse } from '../_shared/http.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: '只接受 POST' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const lineChannelId = Deno.env.get('LINE_CHANNEL_ID')!
    const authorization = request.headers.get('Authorization')
    if (!authorization) return jsonResponse({ error: '缺少 Supabase 登入狀態' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return jsonResponse({ error: 'Supabase 登入狀態無效' }, 401)

    const body = await request.json()
    const idToken = typeof body.idToken === 'string' ? body.idToken : ''
    const period = Number(body.period ?? 2)
    const unit = typeof body.unit === 'string' ? body.unit.trim().toUpperCase() : ''
    if (!idToken) return jsonResponse({ error: '缺少 LINE ID token' }, 400)
    if (!Number.isInteger(period) || period < 1 || period > 10) return jsonResponse({ error: '期別格式錯誤' }, 400)
    if (!/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]+$/.test(unit)) return jsonResponse({ error: '戶號格式錯誤' }, 400)

    const verifyBody = new URLSearchParams({ id_token: idToken, client_id: lineChannelId })
    const lineResponse = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyBody,
    })
    const lineIdentity = await lineResponse.json()
    if (!lineResponse.ok || typeof lineIdentity.sub !== 'string') {
      return jsonResponse({ error: 'LINE 身分驗證失敗' }, 401)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const { data: customer, error: lookupError } = await admin
      .from('customer')
      .select('id,name,period,unit,line_user_id,auth_user_id')
      .eq('period', period)
      .eq('unit', unit)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!customer) return jsonResponse({ error: '戶號不在白名單，請聯絡團主' }, 403)

    assertBindingAllowed(customer.line_user_id, customer.auth_user_id, lineIdentity.sub, user.id)

    let bindQuery = admin
      .from('customer')
      .update({ line_user_id: lineIdentity.sub, auth_user_id: user.id })
      .eq('id', customer.id)
    bindQuery = customer.line_user_id === null
      ? bindQuery.is('line_user_id', null)
      : bindQuery.eq('line_user_id', customer.line_user_id)
    bindQuery = customer.auth_user_id === null
      ? bindQuery.is('auth_user_id', null)
      : bindQuery.eq('auth_user_id', customer.auth_user_id)

    const { data: bound, error: bindError } = await bindQuery
      .select('id,name,period,unit,vip_level')
      .maybeSingle()
    if (bindError) throw bindError
    if (!bound) return jsonResponse({ error: '戶號剛被其他帳號綁定，請聯絡團主' }, 409)

    return jsonResponse({ customer: bound, lineProfile: {
      displayName: lineIdentity.name ?? null,
      pictureUrl: lineIdentity.picture ?? null,
    } })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    const status = message.includes('戶號已綁定') ? 409 : 500
    return jsonResponse({ error: message }, status)
  }
})
