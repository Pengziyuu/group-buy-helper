import type { HTMLAttributes, ReactNode } from 'react'

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone
  children: ReactNode
}

export function StatusBadge({ tone = 'neutral', className = '', children, ...props }: StatusBadgeProps) {
  return <span className={`ui-status-badge ${className}`.trim()} data-tone={tone} {...props}>{children}</span>
}
