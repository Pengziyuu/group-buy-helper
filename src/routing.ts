export type AppMode = 'resident' | 'admin'
export type WorkspaceSection = 'overview' | 'orders' | 'content' | 'pickup'
export type ResidentFilter = 'all' | 'unbound' | 'other' | 'blocked'

export type AppRoute =
  | { kind: 'admin-list' }
  | { kind: 'admin-residents' }
  | { kind: 'admin-settings' }
  | { kind: 'admin-notification-lab' }
  | { kind: 'admin-campaign'; campaignId: string; section: WorkspaceSection | null }
  | { kind: 'resident-campaign'; campaignSlug: string }
  | { kind: 'resident-invite'; inviteSlug: string }
  | { kind: 'resident-default' }
  | { kind: 'not-found' }

const UUID_SOURCE = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const SLUG_SOURCE = '[0-9a-f]{36}'
// Section names are lower-case only; the UUID keeps its original case-insensitive match.
const ADMIN_CAMPAIGN_PATTERN = new RegExp(`^/admin/campaign/(${UUID_SOURCE})(?:/(overview|orders|content|pickup))?/?$`)
const RESIDENT_CAMPAIGN_PATTERN = new RegExp(`^/campaign/(${SLUG_SOURCE})/?$`, 'i')
const RESIDENT_INVITE_PATTERN = new RegExp(`^/join/(${SLUG_SOURCE})/?$`)
const ADMIN_PAGES: Record<string, AppRoute> = {
  '/admin': { kind: 'admin-list' },
  '/admin/residents': { kind: 'admin-residents' },
  '/admin/settings': { kind: 'admin-settings' },
  '/admin/notification-lab': { kind: 'admin-notification-lab' },
}

export function resolveLiffPath(pathname: string, search: string): string {
  if (pathname !== '/') return pathname
  const states = new URLSearchParams(search).getAll('liff.state')
  if (states.length !== 1) return pathname
  const stateRoute = parseAppRoute(states[0])
  return stateRoute.kind === 'resident-invite' || stateRoute.kind === 'resident-campaign'
    ? states[0]
    : pathname
}

export function parseAppRoute(pathname: string): AppRoute {
  if (pathname === '/') return { kind: 'resident-default' }

  const adminPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (Object.hasOwn(ADMIN_PAGES, adminPath)) return { ...ADMIN_PAGES[adminPath] }

  const adminMatch = ADMIN_CAMPAIGN_PATTERN.exec(pathname)
  if (adminMatch) {
    return { kind: 'admin-campaign', campaignId: adminMatch[1], section: (adminMatch[2] as WorkspaceSection | undefined) ?? null }
  }

  const residentMatch = RESIDENT_CAMPAIGN_PATTERN.exec(pathname)
  if (residentMatch) return { kind: 'resident-campaign', campaignSlug: residentMatch[1] }

  const inviteMatch = RESIDENT_INVITE_PATTERN.exec(pathname)
  if (inviteMatch) return { kind: 'resident-invite', inviteSlug: inviteMatch[1] }

  return { kind: 'not-found' }
}

export function selectAppMode(pathname: string): AppMode {
  return parseAppRoute(pathname).kind.startsWith('admin-') ? 'admin' : 'resident'
}

export function parseResidentFilter(search: string): ResidentFilter {
  const value = new URLSearchParams(search).get('filter')
  return value === 'unbound' || value === 'other' || value === 'blocked' ? value : 'all'
}

export function campaignSectionPath(campaignId: string, section: WorkspaceSection): string {
  return `/admin/campaign/${campaignId}/${section}`
}
