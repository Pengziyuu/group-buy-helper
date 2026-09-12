import type { SupabaseClient } from '@supabase/supabase-js'
import { buildOrganizerOrderSummary, type OrganizerOrderSummary, type OrganizerVisibleOrder } from '../domain/adminOrders'
import { parseCustomOrderItems } from '../domain/customOrderItem'
import type { CampaignStatus } from '../domain/orderWorkflow'
import type { Database, Json } from '../types/database'
import type { QuantityUnit } from '../domain/quantityUnit'

export type AdminOrdersSupabaseClient = SupabaseClient<Database>

type ItemRow = { code: string; name: string; unit_price: number; active: boolean; sort_order: number }
type WallRow = {
  order_id: string | null
  customer_name: string | null
  period: number | null
  unit: string | null
  item_code: string | null
  qty: number | null
  list_unit_price: number | null
  discount_type: string | null
  discount_rate: number | null
  final_unit_price: number | null
  promotion_name: string | null
  custom_items: Json | null
  ordered_at: string | null
  order_updated_at: string | null
}
type StatusRow = {
  order_id: string | null
  paid: boolean | null
  organizer_note: string | null
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return String(error)
}

function validateItems(data: unknown): ItemRow[] {
  if (!Array.isArray(data) || data.some((row) => !row
    || typeof row.code !== 'string'
    || typeof row.name !== 'string'
    || typeof row.unit_price !== 'number'
    || typeof row.active !== 'boolean'
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
  if (!Array.isArray(data)) throw new Error('Supabase 回傳的付款與備註格式錯誤')
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
      threshold: number,
      thresholdKind: 'quantity' | 'amount' = 'quantity',
      amountThreshold: number | null = null,
      quantityUnit: QuantityUnit = '個',
    ): Promise<OrganizerOrderSummary> {
      const [itemResult, wallResult, statusResult] = await Promise.all([
        client
          .from('campaign_item')
          .select('code,name,unit_price,active,sort_order')
          .eq('campaign_id', campaignId)
          .order('sort_order'),
        client
          .from('order_wall')
          .select('order_id,customer_name,period,unit,item_code,qty,list_unit_price,discount_type,discount_rate,final_unit_price,promotion_name,custom_items,ordered_at,order_updated_at')
          .eq('campaign_id', campaignId)
          .order('period'),
        client
          .from('organizer_order_status')
          .select('order_id,paid,organizer_note')
          .eq('campaign_id', campaignId)
          .order('order_id'),
      ])

      if (itemResult.error) throw new Error(`讀取團購品項失敗：${errorMessage(itemResult.error)}`)
      if (wallResult.error) throw new Error(`讀取住戶訂單失敗：${errorMessage(wallResult.error)}`)
      if (statusResult.error) throw new Error(`讀取付款與備註失敗：${errorMessage(statusResult.error)}`)

      const items = validateItems(itemResult.data).map((item) => ({
        code: item.code,
        name: item.name,
        unitPrice: item.unit_price,
        active: item.active,
      }))
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
          itemPriceSnapshots: {},
          customItems: parseCustomOrderItems(row.custom_items),
          paid: status?.paid ?? false,
          organizerNote: status?.organizer_note ?? '',
          orderedAt: row.ordered_at ?? undefined,
          updatedAt: row.order_updated_at ?? undefined,
        }
        if (row.item_code && typeof row.qty === 'number' && row.qty > 0) {
          order.items[row.item_code] = row.qty
          if (row.list_unit_price !== null && row.final_unit_price !== null && row.discount_rate !== null) {
            const appliedDiscountType = row.discount_type === 'base' || row.discount_type === 'mix_match'
              ? row.discount_type
              : 'none'
            order.itemPriceSnapshots![row.item_code] = {
              listUnitPrice: row.list_unit_price,
              appliedDiscountType,
              appliedDiscountRate: row.discount_rate,
              finalUnitPrice: row.final_unit_price,
              promotionName: row.promotion_name,
            }
          }
        }
        ordersById.set(row.order_id, order)
      }

      return buildOrganizerOrderSummary({
        orders: [...ordersById.values()],
        items,
        threshold,
        thresholdKind,
        amountThreshold,
        quantityUnit,
      })
    },

    async setCampaignStatus(campaignId: string, status: CampaignStatus): Promise<void> {
      const { error } = await client.rpc('set_campaign_status', {
        p_campaign_id: campaignId,
        p_status: status,
      })
      if (error) throw new Error(`更新活動狀態失敗：${errorMessage(error)}`)
    },

    async setOrderPaid(orderId: string, paid: boolean): Promise<void> {
      const { error } = await client.rpc('set_order_paid', {
        p_order_id: orderId,
        p_paid: paid,
      })
      if (error) throw new Error(`更新付款狀態失敗：${errorMessage(error)}`)
    },

    async setOrderOrganizerNote(orderId: string, note: string): Promise<void> {
      const { error } = await client.rpc('set_order_organizer_note', {
        p_order_id: orderId,
        p_organizer_note: note,
      })
      if (error) throw new Error(`更新訂單備註失敗：${errorMessage(error)}`)
    },
  }
}
