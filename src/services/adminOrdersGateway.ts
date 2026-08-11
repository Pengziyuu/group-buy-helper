import type { SupabaseClient } from '@supabase/supabase-js'
import { buildOrganizerOrderSummary, type OrganizerOrderSummary, type OrganizerVisibleOrder } from '../domain/adminOrders'
import type { Database } from '../types/database'

export type AdminOrdersSupabaseClient = SupabaseClient<Database>

type ItemRow = { code: string; name: string; sort_order: number }
type WallRow = {
  order_id: string | null
  customer_name: string | null
  period: number | null
  unit: string | null
  item_code: string | null
  qty: number | null
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

function validateItems(data: unknown): ItemRow[] {
  if (!Array.isArray(data) || data.some((row) => !row
    || typeof row.code !== 'string'
    || typeof row.name !== 'string'
    || typeof row.sort_order !== 'number')) {
    throw new Error('Supabase 回傳的團購品項格式錯誤')
  }
  return data
}

function validateWall(data: unknown): WallRow[] {
  if (!Array.isArray(data)) throw new Error('Supabase 回傳的訂單牆格式錯誤')
  return data as WallRow[]
}

export function createAdminOrdersGateway(client: AdminOrdersSupabaseClient) {
  return {
    async loadSummary(
      campaignId: string,
      unitPrice: number,
      threshold: number,
    ): Promise<OrganizerOrderSummary> {
      const [itemResult, wallResult] = await Promise.all([
        client
          .from('campaign_item')
          .select('code,name,sort_order')
          .eq('campaign_id', campaignId)
          .order('sort_order'),
        client
          .from('order_wall')
          .select('order_id,customer_name,period,unit,item_code,qty')
          .eq('campaign_id', campaignId)
          .order('period'),
      ])

      if (itemResult.error) throw new Error(`讀取團購品項失敗：${errorMessage(itemResult.error)}`)
      if (wallResult.error) throw new Error(`讀取住戶訂單失敗：${errorMessage(wallResult.error)}`)

      const items = validateItems(itemResult.data)
      const wallRows = validateWall(wallResult.data)
      const ordersById = new Map<string, OrganizerVisibleOrder>()

      for (const row of wallRows) {
        if (!row.order_id
          || !row.customer_name
          || typeof row.period !== 'number'
          || !row.unit) continue
        const order = ordersById.get(row.order_id) ?? {
          customerId: row.order_id,
          name: row.customer_name,
          period: row.period,
          unit: row.unit,
          items: {},
        }
        if (row.item_code && typeof row.qty === 'number' && row.qty > 0) {
          order.items[row.item_code] = row.qty
        }
        ordersById.set(row.order_id, order)
      }

      return buildOrganizerOrderSummary({
        orders: [...ordersById.values()],
        items,
        unitPrice,
        threshold,
      })
    },
  }
}
