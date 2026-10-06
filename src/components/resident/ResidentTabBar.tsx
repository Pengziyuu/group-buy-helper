import { TAB_ICONS } from './skeletonMarkup'
import { useHiddenWhileScrollingDown } from './useHiddenWhileScrollingDown'

export type ResidentTab = 'campaigns' | 'orders'

const TABS: { tab: ResidentTab; href: string; label: string; icon: string }[] = [
  { tab: 'campaigns', href: '/', label: '團購', icon: TAB_ICONS.campaigns },
  { tab: 'orders', href: '/orders', label: '我的訂單', icon: TAB_ICONS.orders },
]

/** The resident's two top-level pages. A bar along the bottom on phones, beside the account menu on wide screens. */
export function ResidentTabBar({ current }: { current: ResidentTab }) {
  const hidden = useHiddenWhileScrollingDown()
  return (
    <nav className="resident-tabbar" aria-label="住戶頁面" data-hidden={hidden || undefined}>
      {TABS.map(({ tab, href, label, icon }) => (
        <a key={tab} href={href} aria-current={tab === current ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={icon} />
          </svg>
          <span>{label}</span>
        </a>
      ))}
    </nav>
  )
}
