import type { ReactNode } from 'react'

export function StickyActionBar({ children, className = '', ariaLabel = '主要操作' }: { children: ReactNode; className?: string; ariaLabel?: string }) {
  return <section className={`ui-sticky-action ${className}`.trim()} aria-label={ariaLabel}>{children}</section>
}
