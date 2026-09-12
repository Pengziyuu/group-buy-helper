import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260912010000_campaign_discounts.sql')
const sql = readFileSync(migrationPath, 'utf8').toLowerCase()

describe('campaign discount migration', () => {
  it('adds published and draft discount rules plus item eligibility', () => {
    expect(sql).toContain('add column base_discount_rate numeric(5,4) not null default 1')
    expect(sql).toContain('add column mix_match_name text')
    expect(sql).toContain('add column mix_match_min_quantity integer')
    expect(sql).toContain('add column mix_match_discount_rate numeric(5,4)')
    expect(sql).toContain("add column discount_eligible boolean not null default false")
    expect(sql).toContain('lock_published_campaign_items')
    expect(sql).toContain('if v_campaign.opened_at is null then')
    expect(sql).toContain("jsonb_build_object('discounteligible', false)")
    expect(sql).toContain('old.campaign_id, new.campaign_id')
    expect(sql).toContain('正式開團後不能修改折扣設定')
  })

  it('stores immutable order-item pricing snapshots', () => {
    expect(sql).toContain('add column list_unit_price numeric(12,2)')
    expect(sql).toContain('add column discount_rate numeric(5,4)')
    expect(sql).toContain('add column final_unit_price numeric(12,2)')
    expect(sql).toContain('add column discount_type text')
    expect(sql).toContain('add column promotion_name text')
    expect(sql).toContain("discount_type in ('none', 'base', 'mix_match')")
  })

  it('recalculates the full order atomically and keeps the current RPC signature compatible', () => {
    expect(sql).toContain('create or replace function public.submit_customer_order(')
    expect(sql).toContain('p_custom_items jsonb default null')
    expect(sql).toContain('v_mix_match_quantity')
    expect(sql).toContain('round(item.unit_price * applied.rate, 0)')
    expect(sql).toContain('final_unit_price')
    expect(sql).toContain('revoke insert, update, delete on table public.orders from authenticated')
    expect(sql).toContain('revoke insert, update, delete on table public.order_item from authenticated')
    expect(sql).toContain('訂單已付款，不能修改')
  })

  it('uses historical final prices for amount progress, payment and organizer exports', () => {
    expect(sql).toContain('order_item.qty * order_item.final_unit_price')
    expect(sql).toContain('oi.list_unit_price')
    expect(sql).toContain('oi.discount_rate')
    expect(sql).toContain('oi.discount_type')
    expect(sql).toContain('oi.promotion_name')
    expect(sql).toContain('create or replace function public.set_order_paid(')
    expect(sql).toContain('create view public.order_wall')
  })
})
