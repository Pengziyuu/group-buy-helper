import type { ReactNode } from 'react'
import { Button } from './Button'

export type FeedbackTone = 'success' | 'error' | 'warning' | 'info'

type FeedbackMessageProps = {
  tone: FeedbackTone
  children: ReactNode
  actionLabel?: string
  onAction?: () => void
  className?: string
  urgent?: boolean
}

export function FeedbackMessage({ tone, children, actionLabel, onAction, className = '', urgent = false }: FeedbackMessageProps) {
  const assertive = urgent || tone === 'error'
  return (
    <div
      className={`ui-feedback ${className}`.trim()}
      data-tone={tone}
      role={assertive ? 'alert' : 'status'}
    >
      <span>{children}</span>
      {actionLabel && onAction && <Button variant="tertiary" onClick={onAction}>{actionLabel}</Button>}
    </div>
  )
}
