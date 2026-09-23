import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, jsonResponse, readJsonBodyWithLimit } from '../_shared/http.ts'
import { checkResidentGroupMemberships } from '../_shared/residentGroupMembership.ts'

const VALID_CODE = /^[0-9a-f]{36}$/
type Candidate = { member_code: string; line_user_id: string; binding_revision: string | null; line_group_id: string | null }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: '只接受 POST' }, 405)
  try {
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
    if (!token) return jsonResponse({ error: '需要團主登入' }, 401)
    const url = Deno.env.get('SUPABASE_URL')!
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: identity, error: userError } = await userClient.auth.getUser(token)
    if (userError || !identity.user || identity.user.is_anonymous) return jsonResponse({ error: '團主登入已失效' }, 401)
    const [adminResult, organizerResult] = await Promise.all([
      userClient.rpc('is_admin'), userClient.rpc('is_approved_line_organizer'),
    ])
    if (adminResult.error || adminResult.data !== true || organizerResult.error || organizerResult.data !== true) {
      return jsonResponse({ error: '需要已核准的團主權限' }, 403)
    }
    const body = await readJsonBodyWithLimit(request, 4096)
    const codes = body.memberCodes
    if (!Array.isArray(codes) || codes.length < 1 || codes.length > 20
      || codes.some((code) => typeof code !== 'string' || !VALID_CODE.test(code))
      || new Set(codes).size !== codes.length) return jsonResponse({ error: '住戶名單格式錯誤' }, 400)
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data, error } = await service.rpc('service_resident_group_candidates', { p_member_codes: codes })
    if (error) throw new Error('candidate lookup failed')
    const candidates = data as Candidate[]
    if (!Array.isArray(candidates) || candidates.length !== codes.length
      || new Set(candidates.map((item) => item.member_code)).size !== codes.length
      || candidates.some((item) => !codes.includes(item.member_code) || typeof item.line_user_id !== 'string')) {
      return jsonResponse({ error: '住戶名單已變更，請重新載入' }, 409)
    }
    const revision = candidates[0]?.binding_revision
    const groupId = candidates[0]?.line_group_id
    if (!revision || !groupId || candidates.some((item) => item.binding_revision !== revision || item.line_group_id !== groupId)) {
      return jsonResponse({ error: '正式群組尚未綁定，無法查驗' }, 503)
    }
    const startedAt = new Date().toISOString()
    const statuses = await checkResidentGroupMemberships(groupId, candidates.map((item) => item.line_user_id),
      Deno.env.get('LINE_MESSAGING_CHANNEL_ACCESS_TOKEN') ?? '')
    if (statuses.some((status) => status === 'unknown')) {
      return jsonResponse({ error: '目前無法確認群組狀態，舊查驗結果未變更；請稍後重試' }, 503)
    }
    const { error: recordError } = await service.rpc('service_record_resident_group_checks', {
      p_binding_revision: revision,
      p_checked_at: startedAt,
      p_checks: candidates.map((item, index) => ({ line_user_id: item.line_user_id, group_status: statuses[index] })),
    })
    if (recordError) return jsonResponse({ error: '群組或住戶狀態已變更，請重新查驗' }, 409)
    const { data: rows, error: readError } = await userClient.rpc('admin_list_resident_group_statuses')
    if (readError) throw new Error('status read failed')
    const statusByCode = new Map((rows ?? []).map((row) => [row.member_code, row]))
    if (codes.some((code) => !statusByCode.has(code))) return jsonResponse({ error: '住戶名單已變更，請重新載入' }, 409)
    return jsonResponse({ members: codes.map((code) => {
      const row = statusByCode.get(code)!
      return { memberCode: code, groupStatus: row.group_status, groupCheckedAt: row.group_checked_at }
    }) })
  } catch {
    // Never expose group IDs, provider subjects, credentials or database details.
    return jsonResponse({ error: '群組查驗服務暫時無法使用' }, 503)
  }
})
