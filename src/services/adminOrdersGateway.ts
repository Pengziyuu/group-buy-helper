import type { SupabaseClient } from '@supabase/supabase-js'
import type { FulfillmentUpdate } from '../AdminOrdersPanel'
import { buildOrganizerOrderSummary, type OrganizerOrderSummary, type OrganizerVisibleOrder } from '../domain/adminOrders'
import type { CampaignStatus, PickupStatus } from '../domain/orderWorkflow'
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
type StatusRow = {
  order_id: string | null
  paid: boolean | null
  pickup_status: string | null
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

function validateStatuses(data: unknown): StatusRow[] {
  if (!Array.isArray(data)) throw new Error('Supabase 回傳的付款領取狀態格式錯誤')
  return data as StatusRow[]
}

export function createAdminOrdersGateway(client: AdminOrdersSupabaseClient) {
  return {
    async loadCampaignStatus(campaignId: string): Promise<CampaignStatus> {
      const { data, error } = await client
        .from('campaign_public')
        .select('status')
        .eq('id', campaignId)
        .single()
      if (error) throw new Error(`讀取活動狀態失敗：${errorMessage(error)}`)
      if (!data || typeof data.status !== 'string' || !['open', 'closed', 'arrived'].includes(data.status)) {
        throw new Error('Supabase 回傳的活動狀態格式錯誤')
      }
      return data.status as CampaignStatus
    },

    async loadSummary(
      campaignId: string,
      unitPrice: number,
      threshold: number,
    ): Promise<OrganizerOrderSummary> {
      const [itemResult, wallResult, statusResult] = await Promise.all([
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
        client
          .from('organizer_order_status')
          .select('order_id,paid,pickup_status')
          .eq('campaign_id', campaignId)
          .order('order_id'),
      ])

      if (itemResult.error) throw new Error(`讀取團購品項失敗：${errorMessage(itemResult.error)}`)
      if (wallResult.error) throw new Error(`讀取住戶訂單失敗：${errorMessage(wallResult.error)}`)
      if (statusResult.error) throw new Error(`讀取付款領取狀態失敗：${errorMessage(statusResult.error)}`)

      const items = validateItems(itemResult.data)
      const wallRows = validateWall(wallResult.data)
      const statuses = new Map(
        validateStatuses(statusResult.data)
          .filter((row) => row.order_id)
          .map((row) => [row.order_id as string, row]),
      )
      const ordersById = new Map<string, OrganizerVisibleOrder>()

      for (const row of wallRows) {
        if (!row.order_id
          || !row.customer_name
          || typeof row.period !== 'number'
          || !row.unit) continue
        const status = statuses.get(row.order_id)
        const order = ordersById.get(row.order_id) ?? {
          orderId: row.order_id,
          customerId: row.order_id,
          name: row.customer_name,
          period: row.period,
          unit: row.unit,
          items: {},
          paid: status?.paid ?? false,
          pickupStatus: (status?.pickup_status ?? 'pending') as PickupStatus,
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

    async setCampaignStatus(campaignId: string, status: CampaignStatus): Promise<void> {
      const { error } = await client.rpc('set_campaign_status', {
        p_campaign_id: campaignId,
        p_status: status,
      })
      if (error) throw new Error(`更新活動狀態失敗：${errorMessage(error)}`)
    },

    async setOrderFulfillment(orderId: string, update: FulfillmentUpdate): Promise<void> {
      const { error } = await client.rpc('set_order_fulfillment', {
        p_order_id: orderId,
        p_paid: update.paid,
        p_pickup_status: update.pickupStatus,
      })
      if (error) throw new Error(`更新付款領取狀態失敗：${errorMessage(error)}`)
    },
  }
}
