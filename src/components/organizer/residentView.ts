import { formatHousehold } from '../../domain/household'
import type { ResidentFilter } from '../../routing'
import type { ResidentMember } from '../../services/residentMemberManagementGateway'

const FILTERS: ResidentFilter[] = ['all', 'unbound', 'other', 'blocked']

export function isUnboundResident(member: ResidentMember): boolean {
  return !member.blocked && (member.householdKind ?? 'resident') === 'resident' && (member.period === null || !member.unit)
}

export function residentHouseholdLabel(member: ResidentMember): string {
  const kind = member.householdKind ?? 'resident'
  if (kind === 'resident' && (member.period === null || !member.unit)) return '尚未填戶號'
  return formatHousehold(kind, member.period, member.unit)
}

export function matchesResidentFilter(member: ResidentMember, filter: ResidentFilter): boolean {
  if (filter === 'blocked') return member.blocked
  if (member.blocked) return false
  if (filter === 'unbound') return isUnboundResident(member)
  if (filter === 'other') return member.householdKind === 'other'
  return true
}

export function countResidents(members: ResidentMember[]): Record<ResidentFilter, number> {
  return Object.fromEntries(
    FILTERS.map((filter) => [filter, members.filter((member) => matchesResidentFilter(member, filter)).length]),
  ) as Record<ResidentFilter, number>
}

export function matchesResidentSearch(member: ResidentMember, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [member.displayName, residentHouseholdLabel(member), member.unit ?? '']
    .some((value) => value.toLowerCase().includes(needle))
}
