// One outline per resident page, as plain HTML. The same strings are written into index.html at build
// time (shown the moment the page arrives, before any script) and rendered by React while it loads
// (ResidentSkeletons), so the hand-over between the two changes nothing on screen. Styles: skeleton.css.

export type SkeletonPage = 'campaigns' | 'orders' | 'campaign'

// Lucide (ISC) shopping-bag and receipt-text, as one path each, so the static outline and the live tab
// bar draw the very same icons the rest of the app uses.
export const TAB_ICONS = {
  campaigns: 'M16 10a4 4 0 0 1-8 0 M3.103 6.034h17.794 M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z',
  orders: 'M13 16H8 M14 8H8 M16 12H8 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z',
} as const

/** One sweep of the sheen; React picks up the static outline's sweep where it is, not from the start. */
export const SKELETON_SHEEN_MS = 1400

const block = (modifier: string) => `<span class="sk-block ${modifier}"></span>`

const card = `<div class="sk-card">${block('sk-thumb')}<div class="sk-lines">${block('sk-title')}${block('sk-short')}${block('sk-bar')}</div></div>`

function tab(page: 'campaigns' | 'orders', current: boolean): string {
  const [href, label] = page === 'campaigns' ? ['/', '團購'] : ['/orders', '我的訂單']
  return `<a href="${href}"${current ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${TAB_ICONS[page]}"/></svg><span>${label}</span></a>`
}

function listPage(page: 'campaigns' | 'orders'): string {
  return `<header class="sk-header"><span class="sk-brand">團購小幫手</span><span class="sk-header-end"><nav class="sk-tabbar" aria-label="住戶頁面">${tab('campaigns', page === 'campaigns')}${tab('orders', page === 'orders')}</nav>${block('sk-avatar')}</span></header>`
    + `<div class="sk-list" aria-hidden="true">${block('sk-heading')}<div class="sk-cards">${card}${card}${card}</div></div>`
}

const campaignPage = '<header class="sk-header"><a class="sk-back" href="/"><span aria-hidden="true">‹</span>全部團購</a></header>'
  + '<div class="sk-campaign" aria-hidden="true">'
  + `<div class="sk-section">${block('sk-badge')}${block('sk-title')}${block('sk-short')}<div class="sk-pair">${block('sk-box')}${block('sk-box')}</div>${block('sk-bar')}</div>`
  + `<div class="sk-section">${block('sk-heading')}${block('sk-picture')}${block('sk-title')}${block('sk-short')}</div>`
  + '</div>'

/** The outline of one page; screen readers hear only the label. */
export function skeletonMarkup(page: SkeletonPage, label: string): string {
  const body = page === 'campaign' ? campaignPage : listPage(page)
  return `<div class="sk-page" role="status" aria-busy="true" aria-label="${label}">${body}</div>`
}

/**
 * Runs in index.html's head before anything paints: picks the outline for this address, the way
 * routing.ts does (a LINE entry arrives at / with the campaign in liff.state), and notes when the
 * sheen started.
 */
export const SKELETON_BOOT_SCRIPT = `(function(){var p=location.pathname;if(p==='/'){var s=new URLSearchParams(location.search).getAll('liff.state');if(s.length===1)p=s[0].split('?')[0];}`
  + `document.documentElement.setAttribute('data-sk',/^\\/(c|campaign)\\//i.test(p)?'campaign':/^\\/orders\\/?$/.test(p)?'orders':'campaigns');`
  + `window.__skeletonStart=performance.now();})();`

/** All three outlines; the script above leaves only the one for this page visible. */
export function bootSkeletonMarkup(): string {
  const label = '載入團購小幫手…'
  return (['campaigns', 'orders', 'campaign'] as const)
    .map((page) => `<div class="sk-variant" data-variant="${page}">${skeletonMarkup(page, label)}</div>`)
    .join('')
}
