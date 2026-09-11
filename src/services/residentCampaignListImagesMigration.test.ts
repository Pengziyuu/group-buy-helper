import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260911173000_resident_campaign_list_images.sql'),
  'utf8',
).toLowerCase()

describe('resident campaign list images migration', () => {
  it('returns only published campaign image metadata through the resident list RPC', () => {
    expect(migration).toMatch(/returns table\s*\([\s\S]*images jsonb/i)
    expect(migration).toMatch(/campaign\.images/)
    expect(migration).not.toMatch(/campaign_draft\.images/)
  })

  it('keeps the resident-only access boundary', () => {
    expect(migration).toContain('member.user_id = auth.uid()')
    expect(migration).toContain('campaign.opened_at is not null')
    expect(migration).toContain('revoke all on function public.list_resident_campaigns() from public, anon')
    expect(migration).toContain('grant execute on function public.list_resident_campaigns() to authenticated, service_role')
  })
})