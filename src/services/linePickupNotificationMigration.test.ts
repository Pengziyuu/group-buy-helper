import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260901223000_line_pickup_notifications.sql')

describe('LINE pickup notification migration', () => {
  const sql = readFileSync(migrationPath, 'utf8')

  it('keeps the group id and LINE recipient ids service-role only', () => {
    expect(sql).toMatch(/create table public\.community_line_group/i)
    expect(sql).toMatch(/alter table public\.community_line_group enable row level security/i)
    expect(sql).toMatch(/revoke all on table public\.community_line_group from public, anon, authenticated/i)
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.community_line_group to service_role/i)
    expect(sql).toMatch(/revoke all on function public\.internal_pickup_notification_recipients\(uuid, text\) from public, anon, authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.internal_pickup_notification_recipients\(uuid, text\) to service_role/i)
  })

  it('requires an approved LINE organizer and keeps short-lived intent state service-role only', () => {
    expect(sql).toContain('is_approved_line_organizer')
    expect(sql).toMatch(/admin_users[\s\S]*line_organizer_identity/i)
    expect(sql).toContain('pickup_notification_intent')
    expect(sql).toContain('line_webhook_event_replay')
    expect(sql).toContain('reserve_pickup_notification_intent')
    expect(sql).toContain('finalize_pickup_notification_intent')
    expect(sql).toContain('inspect_pickup_notification_intent')
    expect(sql).toContain('claim_pickup_notification_intent')
    expect(sql).toContain('mark_pickup_notification_intent_sent')
    expect(sql).toContain('process_line_group_binding_event')
    expect(sql).toMatch(/p_caller_user_id[\s\S]*admin_users[\s\S]*line_organizer_identity/i)
    expect(sql).toContain('retain_until')
    expect(sql).toMatch(/retain_until timestamptz not null default \(now\(\) \+ interval '1 hour'\)/i)
    expect(sql).toMatch(/delivery_status = 'sending'[\s\S]*expires_at = intent\.retain_until/i)
    expect(sql).not.toMatch(/set delivery_status = 'sending'[\s\S]{0,200}now\(\) \+ interval '1 hour'/i)
    expect(sql).toMatch(/if v_intent\.delivery_status = 'sending'[\s\S]*return;[\s\S]*update public\.pickup_notification_intent[\s\S]*from public\.campaign/i)
    expect(sql).toContain('internal_pickup_notification_eligible_hash')
    expect(sql).toContain('p_eligible_hash')
    expect(sql).toContain('p_line_group_id')
    expect(sql).toMatch(/delivery_status = 'sending'[\s\S]*return;[\s\S]*internal_pickup_notification_eligible_hash/i)
    expect(sql).toMatch(/community_line_group binding[\s\S]*binding\.line_group_id = p_line_group_id/i)
    expect(sql).toContain('intent.line_group_id = p_line_group_id')
    expect(sql).toMatch(/cron\.schedule[\s\S]*\*\/5 \* \* \* \*/i)
    expect(sql).toMatch(/delete from public\.pickup_notification_intent[\s\S]*expires_at <= now\(\)/i)
    expect(sql).toMatch(/revoke all on table public\.pickup_notification_intent from public, anon, authenticated/i)
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.pickup_notification_intent[\s\S]*to service_role/i)
    expect(sql).not.toMatch(/sent_at|sent_by|message_body/i)
  })

  it('derives recipients from persisted positive orders and requires a closed or arrived campaign', () => {
    expect(sql).toMatch(/v_campaign\.status not in \('closed', 'arrived'\)/i)
    expect(sql).toMatch(/join public\.orders/i)
    expect(sql).toMatch(/join public\.order_item/i)
    expect(sql).toMatch(/order_item\.qty > 0/i)
    expect(sql).toMatch(/join public\.line_resident_identity/i)
    expect(sql).toMatch(/join public\.community_member/i)
    expect(sql).toMatch(/p_audience = 'phase13'.*customer\.period in \(1, 3\)/is)
    expect(sql).toMatch(/p_audience = 'phase2'.*customer\.period = 2/is)
  })
})
