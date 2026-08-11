import { createClient } from 'npm:@supabase/supabase-js@2'
import { normalizeOrderItems } from '../_shared/policies.ts'
import { corsHeaders, jsonResponse } from '../_shared/http.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: '只接受 POST' }, 405)

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization) return jsonResponse({ error: '尚未登入' }, 401)

    const client = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      },
    )
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError || !user) return jsonResponse({ error: '登入狀態無效' }, 401)

    const body = await request.json()
    const campaignId = typeof body.campaignId === 'string' ? body.campaignId : ''
    if (!campaignId) return jsonResponse({ error: '缺少團購 ID' }, 400)

    const { data: campaignItems, error: itemError } = await client
      .from('campaign_item')
      .select('code')
      .eq('campaign_id', campaignId)
    if (itemError) throw itemError
    const items = normalizeOrderItems(body.items, (campaignItems ?? []).map((item) => item.code))
    if (Object.keys(items).length === 0) return jsonResponse({ error: '訂單至少需要一個品項' }, 400)

    const { data, error } = await client.rpc('submit_customer_order', {
      p_campaign_id: campaignId,
      p_items: items,
    })
    if (error) throw error
    return jsonResponse({ order: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤'
    const clientError = /不存在的品項|0 到 20|已結單|白名單|尚未綁定/.test(message)
    return jsonResponse({ error: message }, clientError ? 400 : 500)
  }
})
