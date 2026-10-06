import { useEffect, useState } from 'react'

export type ResidentTab = 'campaigns' | 'orders'

const TABS: { tab: ResidentTab; href: string; label: string; icon: string }[] = [
  { tab: 'campaigns', href: '/', label: '團購', icon: 'M6 7h12l-1 13H7L6 7Zm3 0a3 3 0 0 1 6 0' },
  { tab: 'orders', href: '/orders', label: '我的訂單', icon: 'M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21V3Zm3 5h4m-4 4h4' },
]

// Within this distance of the top the bar always shows; smaller moves than STEP are jitter.
const TOP = 80
const STEP = 8

/** Hidden while scrolling down, shown again on any real scroll up, as in Safari and LINE. */
function useHiddenWhileScrollingDown(): boolean {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (y <= TOP) setHidden(false)
      else if (y > last + STEP) setHidden(true)
      else if (y < last - STEP) setHidden(false)
      else return
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return hidden
}

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
