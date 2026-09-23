import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type OrganizerLocation = { pathname: string; search: string }
export type NavigateOptions = { replace?: boolean }
export type OrganizerNavigate = (path: string, options?: NavigateOptions) => void

// Without a provider (isolated component tests), replacing only rewrites the address bar.
function browserNavigate(path: string, options: NavigateOptions = {}) {
  if (options.replace) window.history.replaceState(window.history.state, '', path)
  else window.location.assign(path)
}

export const OrganizerNavigationContext = createContext<OrganizerNavigate>(browserNavigate)

export function useOrganizerNavigate(): OrganizerNavigate {
  return useContext(OrganizerNavigationContext)
}

export function useBrowserLocation(initial: OrganizerLocation): [OrganizerLocation, OrganizerNavigate] {
  const [source, setSource] = useState(initial)
  const [location, setLocation] = useState(initial)
  if (source.pathname !== initial.pathname || source.search !== initial.search) {
    setSource(initial)
    setLocation(initial)
  }

  useEffect(() => {
    const sync = () => setLocation({ pathname: window.location.pathname, search: window.location.search })
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const navigate = useCallback<OrganizerNavigate>((path, options = {}) => {
    const url = new URL(path, window.location.origin)
    const next = `${url.pathname}${url.search}`
    if (options.replace) {
      window.history.replaceState(window.history.state, '', next)
    } else {
      window.history.pushState(null, '', next)
      document.documentElement.scrollTop = 0
    }
    setLocation({ pathname: url.pathname, search: url.search })
  }, [])

  return [location, navigate]
}
