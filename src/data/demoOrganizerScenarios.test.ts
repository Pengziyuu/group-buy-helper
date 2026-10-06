import { describe, expect, it } from 'vitest'
import { demoOrganizerMembers, demoRefreshGroupStatuses } from './demoOrganizerScenarios'
import { demoResidentScenarios } from './demoResidentScenarios'

describe('demo organizer members', () => {
  it('show every LINE group state the live residents page can show', () => {
    const members = demoOrganizerMembers(demoResidentScenarios(Date.parse('2026-10-07T00:00:00.000Z')))
    expect(new Set(members.map((member) => member.groupStatus))).toEqual(new Set(['in_group', 'not_in_group', 'unknown', 'unchecked']))
    expect(members.filter((member) => member.groupStatus === 'unchecked').every((member) => member.groupCheckedAt === null)).toBe(true)
    expect(members.filter((member) => member.groupStatus === 'in_group').every((member) => typeof member.groupCheckedAt === 'string')).toBe(true)
  })

  it('answers a group check for the members asked about, stamped now', async () => {
    const now = new Date('2026-10-07T03:00:00.000Z')
    const updates = await demoRefreshGroupStatuses(['demo-member-001', 'demo-member-005'], now)
    expect(updates.map((update) => update.memberCode)).toEqual(['demo-member-001', 'demo-member-005'])
    expect(updates.every((update) => update.groupCheckedAt === now.toISOString() && update.groupStatus !== 'unchecked')).toBe(true)
  })
})
