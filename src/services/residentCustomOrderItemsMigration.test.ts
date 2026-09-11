import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260911010000_resident_custom_order_items.sql'), 'utf8').toLowerCase()
const additiveSchema = migration.slice(0, migration.indexOf('create or replace function public.publish_campaign_draft'))

describe('resident custom order items migration', () => {
  it('adds disabled campaign settings and empty order data without rewriting existing rows', () => {
    expect(migration).toContain("add column allow_custom_items boolean not null default false")
    expect(migration).toContain("add column custom_items jsonb not null default '[]'::jsonb")
    expect(additiveSchema).not.toMatch(/update\s+public\.(campaign|campaign_draft|orders)\s+set/)
  })

  it('validates custom items and keeps them outside threshold calculations', () => {
    expect(migration).toContain('p_custom_items jsonb default')
    expect(migration).toContain('not v_campaign.allow_custom_items')
    expect(migration).toMatch(/jsonb_array_length\(case[\s\S]+\) <= 10/)
    expect(migration).toContain("length(btrim(entry ->> 'name'))")
    expect(migration).toContain("entry ->> 'quantity'")
    expect(migration).toMatch(/v_desired_quantity[\s\S]+from jsonb_each\(v_desired_items\)/)
    expect(migration).not.toMatch(/v_desired_quantity[\s\S]{0,180}p_custom_items/)
  })

  it('publishes the setting and exposes custom items through safe read paths', () => {
    expect(migration).toContain('allow_custom_items = v_draft.allow_custom_items')
    expect(migration).toContain('正式開團後不能修改住戶額外品項設定')
    expect(migration).toMatch(/create view public\.order_wall[\s\S]+customer_order\.custom_items/)
    expect(migration).toMatch(/create or replace view public\.campaign_public[\s\S]+allow_custom_items/)
    expect(migration).toMatch(/create function public\.list_resident_campaigns\(\)[\s\S]+allow_custom_items/)
    expect(migration).toContain('create trigger lock_published_campaign_custom_items')
    expect(migration).toContain('revoke insert, update, delete on table public.campaign from authenticated')
    expect(migration).toContain('create trigger lock_published_draft_custom_items')
    expect(migration).toContain('before update of allow_custom_items, campaign_id on public.campaign_draft')
    expect(migration).toContain('create trigger lock_published_draft_custom_items_insert')
    expect(migration).toContain('create trigger lock_published_draft_delete')
  })

  it('keeps custom-only orders eligible for pickup notifications', () => {
    const recipients = migration.match(/create or replace function public\.internal_pickup_notification_recipients[\s\S]+?end;\n\$\$;/)?.[0] ?? ''
    const eligibleHash = migration.match(/create or replace function public\.internal_pickup_notification_eligible_hash[\s\S]+?\n\$\$;/)?.[0] ?? ''
    expect(recipients).toContain('join public.orders customer_order')
    expect(eligibleHash).toContain('join public.orders customer_order')
    expect(recipients).not.toContain('join public.order_item')
    expect(eligibleHash).not.toContain('join public.order_item')
    expect(recipients).toContain('jsonb_array_length(customer_order.custom_items) > 0')
    expect(eligibleHash).toContain('jsonb_array_length(customer_order.custom_items) > 0')
    expect(recipients).toContain('exists (select 1 from public.order_item')
    expect(eligibleHash).toContain('exists (select 1 from public.order_item')
  })
})
