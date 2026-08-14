import { describe, expect, it } from 'vitest'
import { parseAppRoute, resolveLiffPath, selectAppMode } from './routing'

const campaignId = '8d2f0f6a-1111-4222-8333-123456789abc'
const campaignSlug = '0123456789abcdef0123456789abcdef0123'
const inviteSlug = 'abcdef0123456789abcdef0123456789abcd'

describe('app routing', () => {
  it('opens organizer mode on admin list and exact editor paths', () => {
    expect(selectAppMode('/admin')).toBe('admin')
    expect(selectAppMode('/admin/')).toBe('admin')
    expect(selectAppMode(`/admin/campaign/${campaignId}`)).toBe('admin')
    expect(selectAppMode('/')).toBe('resident')
    expect(selectAppMode(`/campaign/${campaignSlug}`)).toBe('resident')
  })

  it('parses organizer list, editor, and resident share routes', () => {
    expect(parseAppRoute('/admin')).toEqual({ kind: 'admin-list' })
    expect(parseAppRoute(`/admin/campaign/${campaignId}`)).toEqual({ kind: 'admin-editor', campaignId })
    expect(parseAppRoute(`/campaign/${campaignSlug}`)).toEqual({ kind: 'resident-campaign', campaignSlug })
    expect(parseAppRoute(`/join/${inviteSlug}`)).toEqual({ kind: 'resident-invite', inviteSlug })
    expect(parseAppRoute('/')).toEqual({ kind: 'resident-default' })
  })

  it('rejects malformed, encoded, and trailing-segment campaign routes safely', () => {
    expect(parseAppRoute('/admin/campaign/not-a-uuid')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/admin/campaign/${campaignId}/extra`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/admin/anything')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/campaign/short')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/campaign/${campaignSlug}/extra`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute('/campaign/%E0%A4%A')).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/admin//campaign/${campaignId}`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`//campaign/${campaignSlug}`)).toEqual({ kind: 'not-found' })
    expect(parseAppRoute(`/c%61mpaign/${campaignSlug}`)).toEqual({ kind: 'not-found' })
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
