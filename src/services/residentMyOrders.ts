import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeQuantityUnit } from '../domain/quantityUnit'
import type { CampaignStatus } from '../domain/orderWorkflow'
import type { ResidentMyOrder } from '../ResidentMyOrdersApp'
import type { Database } from '../types/database'
import type { CampaignImage } from './demoCampaignStore'

type MyOrderRow = Record<string, unknown>

const STATUSES: readonly string[] = ['open', 'closed', 'arrived']

function isCampaignImage(value: unknown): value is CampaignImage {
  return Boolean(value && typeof value === 'object'
    && typeof (value as CampaignImage).src === 'string' && typeof (value as CampaignImage).alt === 'string')
}

function isOrderedItem(value: unknown): value is ResidentMyOrder['items'][number] {
  const item = value as Record<string, unknown> | null
  return Boolean(item && typeof item.name === 'string' && typeof item.quantity === 'number' && typeof item.unitPrice === 'number')
}

function isCustomItem(value: unknown): value is { name: string; quantity: number } {
  const item = value as Record<string, unknown> | null
  return Boolean(item && typeof item.name === 'string' && typeof item.quantity === 'number')
}

/** One list_my_orders() row as the page reads it; null when the row lacks what the page needs. */
export function residentMyOrderFromRow(row: MyOrderRow): ResidentMyOrder | null {
  if (typeof row.campaign_slug !== 'string' || typeof row.title !== 'string' || typeof row.opened_at !== 'string'
    || typeof row.ordered_at !== 'string' || typeof row.status !== 'string' || !STATUSES.includes(row.status)) return null
  return {
    slug: row.campaign_slug,
    title: row.title,
    status: row.status as CampaignStatus,
    openedAt: row.opened_at,
    orderedAt: row.ordered_at,
    images: Array.isArray(row.images) ? row.images.filter(isCampaignImage) : [],
    quantityUnit: normalizeQuantityUnit(row.quantity_unit),
    arrivalLabel: typeof row.arrival_label === 'string' ? row.arrival_label : '貨到通知',
    autoCloseAt: typeof row.auto_close_at === 'string' ? row.auto_close_at : null,
    thresholdKind: row.threshold_kind === 'amount' ? 'amount' : 'quantity',
    thresholdAutoClose: typeof row.threshold_auto_close === 'boolean' ? row.threshold_auto_close : row.threshold_kind !== 'amount',
    closedAt: typeof row.closed_at === 'string' ? row.closed_at : null,
    items: Array.isArray(row.items) ? row.items.filter(isOrderedItem).map(({ name, quantity, unitPrice }) => ({ name: name.trim(), quantity, unitPrice })) : [],
    customItems: Array.isArray(row.custom_items) ? row.custom_items.filter(isCustomItem).map(({ name, quantity }) => ({ name: name.trim(), quantity })) : [],
  }
}

export type ResidentMyOrdersRepository = {
  list(): Promise<ResidentMyOrder[]>
}

export function residentMyOrdersRepository(client: SupabaseClient<Database>): ResidentMyOrdersRepository {
  return {
    async list() {
      const { data, error } = await client.rpc('list_my_orders')
      if (error) throw error
      return (data ?? []).flatMap((row) => {
        const order = residentMyOrderFromRow(row)
        return order ? [order] : []
      })
    },
  }
}
