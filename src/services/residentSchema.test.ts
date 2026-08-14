import { describe, expect, it } from 'vitest'
import sql from '../../supabase/migrations/20260826_000017_line_resident_notebook.sql?raw'

describe('LINE resident notebook migration', () => {
  it('keeps LINE subjects service-role-only and scopes campaign listing through community membership', () => {
    expect(sql).toContain('create table public.community_member')
    expect(sql).toContain('create table public.line_resident_identity')
    expect(sql).toMatch(/singleton boolean not null default true unique/i)
    expect(sql).toMatch(/campaign_single_community[\s\S]*00000000-0000-4000-8000-000000000001/i)
    expect(sql).toMatch(/revoke all on table public\.line_resident_identity from public, anon, authenticated/i)
    expect(sql).toMatch(/where cm\.user_id = auth\.uid\(\)/i)
    expect(sql).toMatch(/c\.opened_at is not null/i)
    const listReturn = sql.match(/create function public\.list_resident_campaigns\(\)\s*returns table \(([\s\S]*?)\)\s*language/i)?.[1] ?? ''
    expect(listReturn).not.toContain('auth_user_id')
    expect(listReturn).not.toContain('line_user_id')
  })

  it('invalidates legacy anonymous campaign access unless the user is a community member', () => {
    expect(sql).toMatch(/create or replace function public\.has_campaign_access[\s\S]*community_member/i)
    expect(sql).toMatch(/create or replace function public\.customer_is_wall_visible[\s\S]*community_member/i)
    expect(sql).toMatch(/create or replace function public\.can_edit_order[\s\S]*community_member/i)
  })

  it('restricts resident provisioning to service role and reuses an organizer binding', () => {
    expect(sql).toMatch(/from public\.line_organizer_identity[\s\S]*auth_user_id/i)
    expect(sql).toMatch(/revoke all on function public\.provision_line_resident[\s\S]*from public, anon, authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.provision_line_resident[\s\S]*to service_role/i)
  })

  it('uses verified identity data when binding a household and exposes only a safe avatar on the wall', () => {
    expect(sql).toMatch(/create function public\.bind_customer_self\(p_period integer, p_unit text\)/i)
    expect(sql).toMatch(/select[\s\S]*display_name[\s\S]*picture_url[\s\S]*from public\.line_resident_identity/i)
    expect(sql).toMatch(/cu\.picture_url/i)
    expect(sql).toMatch(/create function public\.bind_customer_self\(p_name text, p_period integer, p_unit text\)[\s\S]*from public\.bind_customer_self\(p_period, p_unit\)/i)
  })

  it('forces organizer approval to reuse an existing resident Auth UID under the same subject lock', () => {
    expect(sql).toContain('create or replace function public.get_line_organizer_candidate_auth_user')
    expect(sql).toMatch(/create or replace function public\.approve_line_organizer[\s\S]*line_resident_identity/i)
    expect(sql).toMatch(/approve_line_organizer[\s\S]*pg_advisory_xact_lock\(hashtextextended\('line-subject:' \|\| v_request\.line_user_id/i)
  })
})
