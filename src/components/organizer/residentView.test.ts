import { describe, expect, it } from 'vitest'
import type { ResidentMember } from '../../services/residentMemberManagementGateway'
import { countResidents, isUnboundResident, matchesResidentFilter, matchesResidentSearch, residentHouseholdLabel } from './residentView'

const bound: ResidentMember = {
  memberCode: 'a'.repeat(36), displayName: '住戶甲', pictureUrl: null, period: 2, unit: '2K13',
  joinedAt: '2026-08-14T00:00:00Z', blocked: false, blockedAt: null,
}
const unbound: ResidentMember = { ...bound, memberCode: 'b'.repeat(36), displayName: '住戶丁', period: null, unit: null }
const other: ResidentMember = { ...unbound, memberCode: 'c'.repeat(36), displayName: '住戶丙', householdKind: 'other' }
const blocked: ResidentMember = { ...unbound, memberCode: 'd'.repeat(36), displayName: '陌生住戶', blocked: true, blockedAt: '2026-08-15T00:00:00Z' }

describe('resident view', () => {
  it('counts only active residents without a household as unbound, never other or blocked members', () => {
    expect(isUnboundResident(unbound)).toBe(true)
    expect(isUnboundResident(other)).toBe(false)
    expect(isUnboundResident(blocked)).toBe(false)
    expect(isUnboundResident(bound)).toBe(false)
  })

  it('labels households, other members and missing households', () => {
    expect(residentHouseholdLabel(bound)).toBe('二期 2K13')
    expect(residentHouseholdLabel(other)).toBe('其他')
    expect(residentHouseholdLabel(unbound)).toBe('尚未填戶號')
  })

  it('keeps blocked members apart from every other filter and counts each filter', () => {
    const members = [bound, unbound, other, blocked]
    expect(members.filter((member) => matchesResidentFilter(member, 'all'))).toEqual([bound, unbound, other])
    expect(members.filter((member) => matchesResidentFilter(member, 'unbound'))).toEqual([unbound])
    expect(members.filter((member) => matchesResidentFilter(member, 'other'))).toEqual([other])
    expect(members.filter((member) => matchesResidentFilter(member, 'blocked'))).toEqual([blocked])
    expect(countResidents(members)).toEqual({ all: 3, unbound: 1, other: 1, blocked: 1 })
  })

  it('searches by LINE name or household, ignoring case and surrounding spaces', () => {
    expect(matchesResidentSearch(bound, '2k13')).toBe(true)
    expect(matchesResidentSearch(bound, ' 甲 ')).toBe(true)
    expect(matchesResidentSearch(bound, '二期')).toBe(true)
    expect(matchesResidentSearch(bound, '乙')).toBe(false)
    expect(matchesResidentSearch(bound, '   ')).toBe(true)
  })
})
