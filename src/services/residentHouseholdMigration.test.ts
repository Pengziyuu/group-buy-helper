import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260901193000_resident_household_options.sql')

describe('resident household options migration', () => {
  it('enforces the complete phase-specific household format for new writes', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/create (?:or replace )?function public\.valid_resident_household\(p_period integer, p_unit text\)/i)
    expect(sql).toContain("p_period = 1 and p_unit ~ '^[A-Z]([1-9]|1[0-5])$'")
    expect(sql).toContain("p_period in (2, 3) and p_unit ~ '^[1-3][A-Z]([1-9]|1[0-5])$'")
    expect(sql).toMatch(/add constraint customer_household_format[\s\S]*not valid/i)
    expect(sql).toMatch(/validate constraint customer_household_format/i)
  })

  it('updates resident self-binding to accept all three phases through trusted LINE identity', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const bindBody = sql.match(/create or replace function public\.bind_customer_self\(p_period integer, p_unit text\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? ''

    expect(bindBody).toContain('public.valid_resident_household(p_period, v_unit)')
    expect(bindBody).toMatch(/from public\.line_resident_identity/i)
    expect(bindBody).toMatch(/where l\.auth_user_id = v_user_id/i)
    expect(sql).toMatch(/revoke all on function public\.bind_customer_self\(integer, text\)\s+from public, anon/i)
    expect(sql).toMatch(/grant execute on function public\.bind_customer_self\(integer, text\)\s+to authenticated, service_role/i)
  })

  it('adds an admin-only opaque-code RPC without exposing identity identifiers', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const updateBody = sql.match(/create function public\.admin_update_resident_household[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? ''

    expect(updateBody).toMatch(/if not public\.is_admin\(\)/i)
    expect(updateBody).toContain('public.valid_resident_household(p_period, v_unit)')
    expect(updateBody).toMatch(/p_member_code !~ '\^\[0-9a-f\]\{36\}\$'/i)
    expect(updateBody).toMatch(/update public\.customer/i)
    expect(updateBody).toMatch(/auth_user_id = v_user_id/i)
    expect(sql).toMatch(/revoke all on function public\.admin_update_resident_household\(text, integer, text\)[\s\S]*from public, anon, authenticated, service_role/i)
    expect(sql).toMatch(/grant execute on function public\.admin_update_resident_household\(text, integer, text\)[\s\S]*to authenticated, service_role/i)
    expect(updateBody).not.toMatch(/return query|returns table/i)
  })
})
