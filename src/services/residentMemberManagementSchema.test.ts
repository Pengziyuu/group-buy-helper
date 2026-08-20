/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260827_000018_open_line_resident_admission.sql')
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

describe('公開LINE住戶加入與成員管理migration', () => {
  it('以唯一啟用社區取代邀請碼，且provisioning仍限service role', () => {
    expect(sql).toMatch(/drop function public\.provision_line_resident\(text, uuid, text, text, text\)/i)
    expect(sql).toMatch(/create function public\.provision_line_resident\(\s*p_line_user_id text,\s*p_auth_user_id uuid,\s*p_display_name text,\s*p_picture_url text\s*\)/i)
    expect(sql).not.toMatch(/p_invite_slug/i)
    expect(sql).toMatch(/alter table public\.community drop column invite_slug/i)
    expect(sql).toMatch(/where c\.id = '00000000-0000-4000-8000-000000000001'[\s\S]*and c\.active/i)
    expect(sql).toMatch(/revoke all on function public\.provision_line_resident\(text, uuid, text, text\)[\s\S]*from public, anon, authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.provision_line_resident\(text, uuid, text, text\)[\s\S]*to service_role/i)
  })

  it('將封鎖資料及LINE subject隔離於service role', () => {
    expect(sql).toContain('create table public.community_resident_block')
    expect(sql).toMatch(/line_user_id text not null unique/i)
    expect(sql).toMatch(/revoke all on table public\.community_resident_block from public, anon, authenticated/i)
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.community_resident_block to service_role/i)
    expect(sql).toMatch(/resident blocked/i)
  })

  it('以安全成員代碼提供團主管理，不回傳敏感識別欄位', () => {
    const listReturn = sql.match(/create function public\.admin_list_residents\(\)\s*returns table \(([\s\S]*?)\)\s*language/i)?.[1] ?? ''
    expect(listReturn).toContain('member_code text')
    expect(listReturn).toContain('display_name text')
    expect(listReturn).toContain('picture_url text')
    expect(listReturn).toContain('joined_at timestamptz')
    expect(listReturn).toContain('blocked boolean')
    expect(listReturn).not.toMatch(/auth_user_id|line_user_id|community_id|\bid uuid\b/i)
    expect(sql).toMatch(/admin_list_residents[\s\S]*public\.is_admin\(\)/i)
  })

  it('封鎖後立即撤銷既有團購與訂單存取權', () => {
    expect(sql).toMatch(/create or replace function public\.join_campaign_by_slug\(p_slug text\)[\s\S]*return query[\s\S]*join public\.community_member cm[\s\S]*cm\.user_id = auth\.uid\(\)/i)
    expect(sql).toMatch(/create or replace function public\.owns_order\(p_order_id uuid\)[\s\S]*join public\.campaign campaign[\s\S]*join public\.community_member member[\s\S]*member\.user_id = auth\.uid\(\)/i)
  })

  it('封鎖與provisioning採用一致的LINE subject鎖順序', () => {
    const managementBody = sql.match(/create function public\.admin_set_resident_blocked[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? ''
    const lineLock = managementBody.indexOf("pg_advisory_xact_lock(hashtextextended('line-subject:'")
    const memberRowLock = managementBody.indexOf('for update of m')
    expect(lineLock).toBeGreaterThanOrEqual(0)
    expect(memberRowLock).toBeGreaterThanOrEqual(0)
    expect(lineLock).toBeLessThan(memberRowLock)
  })

  it('讓團主以成員代碼封鎖或解除封鎖並同步membership', () => {
    expect(sql).toMatch(/create function public\.admin_set_resident_blocked\(p_member_code text, p_blocked boolean\)/i)
    expect(sql).toMatch(/admin_set_resident_blocked[\s\S]*public\.is_admin\(\)/i)
    expect(sql).toMatch(/insert into public\.community_resident_block/i)
    expect(sql).toMatch(/delete from public\.community_member/i)
    expect(sql).toMatch(/delete from public\.community_resident_block/i)
    expect(sql).toMatch(/insert into public\.community_member/i)
    expect(sql).toMatch(/revoke all on function public\.admin_set_resident_blocked\(text, boolean\)[\s\S]*from public, anon/i)
    expect(sql).toMatch(/grant execute on function public\.admin_set_resident_blocked\(text, boolean\)[\s\S]*to authenticated/i)
  })
})
