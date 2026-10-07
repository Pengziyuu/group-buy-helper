import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Whether the element, at its full height, fits in the window less `reserved` pixels (a sticky top bar
 * and a gap). Followed as the element grows or the window resizes; assumed to fit when not measured.
 */
export function useFitsInViewport(ref: RefObject<HTMLElement | null>, reserved: number, enabled: boolean): boolean {
  const [fits, setFits] = useState(true)

  useLayoutEffect(() => {
    const element = ref.current
    if (!enabled || !element || typeof ResizeObserver === 'undefined') {
      setFits(true)
      return
    }
    const update = () => setFits(element.offsetHeight <= window.innerHeight - reserved)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [ref, reserved, enabled])

  return fits
}
