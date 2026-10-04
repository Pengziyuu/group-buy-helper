import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export type OrganizerLocation = { pathname: string; search: string }
export type NavigateOptions = { replace?: boolean }
export type OrganizerNavigate = (path: string, options?: NavigateOptions) => void
export type OrganizerNavigationBlocker = () => Promise<boolean>
const HISTORY_INDEX = '__organizerHistoryIndex'

export function organizerHistoryIndex(): number | null {
  const index = (window.history.state as Record<string, unknown> | null)?.[HISTORY_INDEX]
  return typeof index === 'number' && Number.isInteger(index) ? index : null
}

export function organizerHistoryState(index: number, state: unknown): Record<string, unknown> {
  return { ...(state && typeof state === 'object' ? state : {}), [HISTORY_INDEX]: index }
}

// Without a provider (isolated component tests), replacing only rewrites the address bar.
function browserNavigate(path: string, options: NavigateOptions = {}) {
  if (options.replace) window.history.replaceState(window.history.state, '', path)
  else window.location.assign(path)
}

type NavigationContextValue = {
  navigate: OrganizerNavigate
  registerBlocker: (blocker: OrganizerNavigationBlocker) => () => void
  preflight: () => Promise<boolean>
}

export const OrganizerNavigationContext = createContext<NavigationContextValue>({
  navigate: browserNavigate,
  registerBlocker: () => () => {},
  preflight: async () => true,
})

export function useOrganizerNavigate(): OrganizerNavigate {
  return useContext(OrganizerNavigationContext).navigate
}

export function useOrganizerNavigationPreflight(): () => Promise<boolean> {
  return useContext(OrganizerNavigationContext).preflight
}

export function useOrganizerNavigationBlocker(blocker: OrganizerNavigationBlocker): void {
  const { registerBlocker } = useContext(OrganizerNavigationContext)
  const latest = useRef(blocker)
  latest.current = blocker
  useEffect(() => registerBlocker(() => latest.current()), [registerBlocker])
}

export type UseBrowserLocationOptions = { enabled?: boolean }

export function useBrowserLocation(
  initial: OrganizerLocation,
  { enabled = true }: UseBrowserLocationOptions = {},
): [OrganizerLocation, OrganizerNavigate, number] {
  const [source, setSource] = useState(initial)
  const [location, setLocation] = useState(initial)
  // Bumped only for a push navigation or a popstate, never a replace, so the
  // organizer focus effect can tell "moved to a new page" from "URL corrected in place".
  const [navigationTick, setNavigationTick] = useState(0)
  const historyIndexRef = useRef(organizerHistoryIndex() ?? 0)
  if (source.pathname !== initial.pathname || source.search !== initial.search) {
    setSource(initial)
    setLocation(initial)
  }

  useEffect(() => {
    if (!enabled) return
    if (organizerHistoryIndex() === null) {
      window.history.replaceState({ ...(window.history.state ?? {}), [HISTORY_INDEX]: historyIndexRef.current }, '')
    }
    const sync = () => {
      historyIndexRef.current = organizerHistoryIndex() ?? historyIndexRef.current
      setLocation({ pathname: window.location.pathname, search: window.location.search })
      setNavigationTick((tick) => tick + 1)
    }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [enabled])

  const navigate = useCallback<OrganizerNavigate>((path, options = {}) => {
    const url = new URL(path, window.location.origin)
    const next = `${url.pathname}${url.search}`
    if (options.replace) {
      window.history.replaceState(window.history.state, '', next)
    } else {
      // A failed legacy-history save may push a source entry with a newly
      // assigned index, without triggering popstate on this location hook.
      historyIndexRef.current = organizerHistoryIndex() ?? historyIndexRef.current
      historyIndexRef.current += 1
      window.history.pushState({ [HISTORY_INDEX]: historyIndexRef.current }, '', next)
      document.documentElement.scrollTop = 0
      setNavigationTick((tick) => tick + 1)
    }
    setLocation({ pathname: url.pathname, search: url.search })
  }, [])

  return [location, navigate, navigationTick]
}

// Moves keyboard focus (and thus the screen-reader announcement) to the new
// page's main heading after an in-app push navigation or popstate, mirroring
// what a full page load would have done before this shell existed. A replace
// (e.g. a bare campaign URL correcting itself to a default section) must not
// steal focus away from wherever the preceding push already put it.
export function useFocusHeadingOnNavigate(navigationTick: number, enabled: boolean): void {
  const hasNavigated = useRef(false)
  useEffect(() => {
    if (!enabled) return
    if (!hasNavigated.current) {
      hasNavigated.current = true
      return
    }
    const heading = document.querySelector<HTMLElement>('main h1, main [data-page-heading], h1')
    if (!heading) return
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1
    heading.focus()
  }, [navigationTick, enabled])
}
