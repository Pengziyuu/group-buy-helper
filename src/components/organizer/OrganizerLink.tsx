import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { OrganizerNavigationContext, useOrganizerNavigate, type OrganizerNavigate } from './organizerNavigation'

export function OrganizerNavigationProvider({ navigate, children }: { navigate: OrganizerNavigate; children: ReactNode }) {
  return <OrganizerNavigationContext.Provider value={navigate}>{children}</OrganizerNavigationContext.Provider>
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
