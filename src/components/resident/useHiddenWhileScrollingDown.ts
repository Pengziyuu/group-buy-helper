import { useEffect, useState } from 'react'

// Within this distance of the top a bar always shows; smaller moves than STEP are jitter.
const TOP = 80
const STEP = 8

/** True while scrolling down, false again on any real scroll up, as in Safari and LINE. */
export function useHiddenWhileScrollingDown(): boolean {
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
