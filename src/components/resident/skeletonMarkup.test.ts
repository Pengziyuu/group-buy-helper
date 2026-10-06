import { afterEach, describe, expect, it } from 'vitest'
import { SKELETON_BOOT_SCRIPT, bootSkeletonMarkup, skeletonMarkup } from './skeletonMarkup'

function bootAt(url: string): string | null {
  window.history.replaceState(null, '', url)
  new Function(SKELETON_BOOT_SCRIPT)()
  return document.documentElement.getAttribute('data-sk')
}

describe('resident boot outline', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    document.documentElement.removeAttribute('data-sk')
  })

  it('picks the outline of the page being opened, including a campaign opened from LINE', () => {
    expect(bootAt('/')).toBe('campaigns')
    expect(bootAt('/orders')).toBe('orders')
    expect(bootAt('/c/abcd1234')).toBe('campaign')
    expect(bootAt('/campaign/0123456789abcdef0123456789abcdef0123')).toBe('campaign')
    // LINE opens the resident entry at / and carries the campaign in liff.state.
    expect(bootAt('/?liff.state=%2Fc%2Fabcd1234')).toBe('campaign')
    expect(window.__skeletonStart).toEqual(expect.any(Number))
  })

  it('writes into index.html exactly the outlines React draws while loading', () => {
    const boot = bootSkeletonMarkup()
    for (const page of ['campaigns', 'orders', 'campaign'] as const) {
      expect(boot).toContain(`<div class="sk-variant" data-variant="${page}">${skeletonMarkup(page, '載入團購小幫手…')}</div>`)
    }
  })
})
