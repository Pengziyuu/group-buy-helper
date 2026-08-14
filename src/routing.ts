export type AppMode = 'resident' | 'admin'

export type AppRoute =
  | { kind: 'admin-list' }
  | { kind: 'admin-editor'; campaignId: string }
  | { kind: 'resident-campaign'; campaignSlug: string }
  | { kind: 'resident-invite'; inviteSlug: string }
  | { kind: 'resident-default' }
  | { kind: 'not-found' }

const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const SLUG_SOURCE = '[0-9a-f]{36}'
const ADMIN_EDITOR_PATTERN = new RegExp(`^/admin/campaign/(${UUID_SOURCE})/?$`, 'i')
const RESIDENT_CAMPAIGN_PATTERN = new RegExp(`^/campaign/(${SLUG_SOURCE})/?$`, 'i')
const RESIDENT_INVITE_PATTERN = new RegExp(`^/join/(${SLUG_SOURCE})/?$`)

export function parseAppRoute(pathname: string): AppRoute {
  if (pathname === '/') return { kind: 'resident-default' }
  if (pathname === '/admin' || pathname === '/admin/') return { kind: 'admin-list' }

  const adminMatch = ADMIN_EDITOR_PATTERN.exec(pathname)
  if (adminMatch) return { kind: 'admin-editor', campaignId: adminMatch[1] }

  const residentMatch = RESIDENT_CAMPAIGN_PATTERN.exec(pathname)
  if (residentMatch) return { kind: 'resident-campaign', campaignSlug: residentMatch[1] }

  const inviteMatch = RESIDENT_INVITE_PATTERN.exec(pathname)
  if (inviteMatch) return { kind: 'resident-invite', inviteSlug: inviteMatch[1] }

  return { kind: 'not-found' }
}

export function selectAppMode(pathname: string): AppMode {
  return parseAppRoute(pathname).kind.startsWith('admin-') ? 'admin' : 'resident'
}
