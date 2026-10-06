import { describe, expect, it } from 'vitest'
import { campaignSectionPath, parseAppRoute, parseResidentFilter, residentCampaignPath, resolveLiffPath, selectAppMode } from './routing'

const campaignId = '8d2f0f6a-1111-4222-8333-123456789abc'
const campaignSlug = '0123456789abcdef0123456789abcdef0123'
const inviteSlug = 'abcdef0123456789abcdef0123456789abcd'
const shortSlug = 'k7qp2xza'

describe('app routing', () => {
  it('opens organizer mode on every organizer page and workspace section', () => {
    for (const path of [
      '/admin', '/admin/', '/admin/residents', '/admin/settings/', '/admin/notification-lab',
      `/admin/campaign/${campaignId}`, `/admin/campaign/${campaignId}/orders`,
    ]) {
      expect(selectAppMode(path)).toBe('admin')
    }
    expect(selectAppMode('/')).toBe('resident')
    expect(selectAppMode(`/campaign/${campaignSlug}`)).toBe('resident')
  })

  it('parses organizer pages, workspace sections, and resident share routes', () => {
    expect(parseAppRoute('/admin')).toEqual({ kind: 'admin-list' })
    expect(parseAppRoute('/admin/residents')).toEqual({ kind: 'admin-residents' })
    expect(parseAppRoute('/admin/settings/')).toEqual({ kind: 'admin-settings' })
    expect(parseAppRoute('/admin/notification-lab')).toEqual({ kind: 'admin-notification-lab' })
    expect(parseAppRoute(`/admin/campaign/${campaignId}`)).toEqual({ kind: 'admin-campaign', campaignId, section: null })
    for (const section of ['overview', 'orders', 'content', 'pickup'] as const) {
      expect(parseAppRoute(`/admin/campaign/${campaignId}/${section}`)).toEqual({ kind: 'admin-campaign', campaignId, section })
      expect(parseAppRoute(`/admin/campaign/${campaignId}/${section}/`)).toEqual({ kind: 'admin-campaign', campaignId, section })
    }
    expect(parseAppRoute(`/campaign/${campaignSlug}`)).toEqual({ kind: 'resident-campaign', campaignSlug })
    expect(parseAppRoute(`/join/${inviteSlug}`)).toEqual({ kind: 'resident-invite', inviteSlug })
    expect(parseAppRoute('/')).toEqual({ kind: 'resident-default' })
    expect(parseAppRoute('/orders')).toEqual({ kind: 'resident-orders' })
    expect(parseAppRoute('/orders/')).toEqual({ kind: 'resident-orders' })
    expect(selectAppMode('/orders')).toBe('resident')
  })

  it('opens campaigns at the short /c/ address with either the new 8-character code or an existing 36-character one', () => {
    expect(parseAppRoute(`/c/${shortSlug}`)).toEqual({ kind: 'resident-campaign', campaignSlug: shortSlug })
    expect(parseAppRoute(`/c/${campaignSlug}`)).toEqual({ kind: 'resident-campaign', campaignSlug })
    // Links already shared in LINE groups keep working.
    expect(parseAppRoute(`/campaign/${campaignSlug}`)).toEqual({ kind: 'resident-campaign', campaignSlug })
    expect(parseAppRoute(`/campaign/${shortSlug}`)).toEqual({ kind: 'resident-campaign', campaignSlug: shortSlug })
    expect(residentCampaignPath(shortSlug)).toBe(`/c/${shortSlug}`)
    for (const bad of ['/c/k7qp2xz', '/c/k7qp2xza9', '/c/k7qp-xza', `/c/${shortSlug}/extra`]) {
      expect(parseAppRoute(bad)).toEqual({ kind: 'not-found' })
    }
    expect(resolveLiffPath('/', `?liff.state=%2Fc%2F${shortSlug}`)).toBe(`/c/${shortSlug}`)
  })

  it('rejects malformed, encoded, unknown-section, and trailing-segment routes safely', () => {
    expect(parseAppRoute('/admin/campaign/not-a-uuid')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/admin/campaign/${campaignId}/extra`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/admin/campaign/${campaignId}/ORDERS`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/admin/campaign/${campaignId}/orders/extra`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/admin/anything')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/admin/residents/extra')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/admin//')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/admin/constructor')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/campaign/short')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/campaign/${campaignSlug}/extra`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/campaign/%E0%A4%A')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/admin//campaign/${campaignId}`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`//campaign/${campaignSlug}`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/c%61mpaign/${campaignSlug}`)).toEqual({ kind: 'not-found' })
  })

  it('reads only known resident filters from the query string', () => {
    expect(parseResidentFilter('?filter=unbound')).toBe('unbound')
    expect(parseResidentFilter('?filter=other')).toBe('other')
    expect(parseResidentFilter('?filter=blocked')).toBe('blocked')
    expect(parseResidentFilter('')).toBe('all')
    expect(parseResidentFilter('?filter=UNBOUND')).toBe('all')
    expect(parseResidentFilter('?filter=unbound&filter=blocked')).toBe('unbound')
  })

  it('builds workspace section paths', () => {
    expect(campaignSectionPath(campaignId, 'orders')).toBe(`/admin/campaign/${campaignId}/orders`)
  })

  it('recovers only strict resident routes from LINE liff.state', () => {
    expect(resolveLiffPath('/', `?liff.state=%2Fjoin%2F${inviteSlug}`)).toBe(`/join/${inviteSlug}`)
    expect(resolveLiffPath('/', `?liff.state=%2Fcampaign%2F${campaignSlug}`)).toBe(`/campaign/${campaignSlug}`)
    expect(resolveLiffPath('/admin', `?liff.state=%2Fjoin%2F${inviteSlug}`)).toBe('/admin')
    expect(resolveLiffPath('/', '?liff.state=https%3A%2F%2Fevil.example')).toBe('/')
    expect(resolveLiffPath('/', `?liff.state=%2Fadmin&liff.state=%2Fjoin%2F${inviteSlug}`)).toBe('/')
    expect(resolveLiffPath('/', `?liff.state=%252Fjoin%252F${inviteSlug}`)).toBe('/')
  })
})
