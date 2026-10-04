import { useCallback, useMemo, useRef, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { OrganizerNavigationContext, useOrganizerNavigate, type OrganizerNavigate, type OrganizerNavigationBlocker } from './organizerNavigation'

export function OrganizerNavigationProvider({ navigate, children }: { navigate: OrganizerNavigate; children: ReactNode }) {
  const blockerRef = useRef<OrganizerNavigationBlocker | null>(null)
  const registerBlocker = useCallback((blocker: OrganizerNavigationBlocker) => {
    blockerRef.current = blocker
    return () => { if (blockerRef.current === blocker) blockerRef.current = null }
  }, [])
  const preflight = useCallback(() => blockerRef.current?.() ?? Promise.resolve(true), [])
  const guardedNavigate = useCallback<OrganizerNavigate>((path, options) => {
    const blocker = blockerRef.current
    const proceed = () => { if (options) navigate(path, options); else navigate(path) }
    if (!blocker) { proceed(); return }
    void blocker().then((allowed) => { if (allowed) proceed() })
  }, [navigate])
  const value = useMemo(() => ({ navigate: guardedNavigate, registerBlocker, preflight }), [guardedNavigate, registerBlocker, preflight])
  return <OrganizerNavigationContext.Provider value={value}>{children}</OrganizerNavigationContext.Provider>
}

type OrganizerLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

export function OrganizerLink({ href, target, onClick, ...props }: OrganizerLinkProps) {
  const navigate = useOrganizerNavigate()
  return (
    <a
      {...props}
      href={href}
      target={target}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || target || event.button !== 0
          || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        navigate(href)
      }}
    />
  )
}
