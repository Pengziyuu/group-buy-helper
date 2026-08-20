/// <reference types="node" />

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260828_000019_reset_test_organizer_resident.sql')
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

describe('Production測試住戶資料全清migration', () => {
  it('以NOWAIT維護鎖避免等待或並行重建資料', () => {
    expect(sql).toMatch(/lock table public\.payment,\s*public\.order_item,\s*public\.orders,\s*public\.customer,\s*public\.campaign_access,\s*public\.community_resident_block,\s*public\.community_member\s*in access exclusive mode nowait/i)
  })

  it('清除全部住戶測試狀態', () => {
    expect(sql).toMatch(/delete from public\.orders/i)
    expect(sql).toMatch(/delete from public\.customer/i)
    expect(sql).toMatch(/delete from public\.campaign_access/i)
    expect(sql).toMatch(/delete from public\.community_resident_block/i)
    expect(sql).toMatch(/delete from public\.community_member/i)
  })

  it('保留Auth、LINE identities、團主權限與團購', () => {
    expect(sql).not.toMatch(/delete from auth\.users/i)
    expect(sql).not.toMatch(/delete from public\.line_organizer_identity/i)
    expect(sql).not.toMatch(/delete from public\.line_resident_identity/i)
    expect(sql).not.toMatch(/delete from public\.admin_users/i)
    expect(sql).not.toMatch(/delete from public\.campaign(?:\s|;)/i)
  })
})
