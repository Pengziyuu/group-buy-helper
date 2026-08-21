import type { ReactNode } from 'react'
import { Button } from './Button'

export function LoadingState({ label, page = false }: { label: string; page?: boolean }) {
  return (
    <div className={`ui-async-state${page ? ' is-page' : ''}`} role="status" aria-label={label} aria-busy="true">
      <span className="ui-spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

type EmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
  page?: boolean
}

export function EmptyState({ title, description, action, page = false }: EmptyStateProps) {
  return (
    <div className={`ui-async-state${page ? ' is-page' : ''}`} data-state="empty">
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}

type ErrorStateProps = {
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
  secondaryAction?: ReactNode
  page?: boolean
}

export function ErrorState({ title, message, actionLabel, onAction, secondaryAction, page = false }: ErrorStateProps) {
  return (
    <div className={`ui-async-state${page ? ' is-page' : ''}`} data-state="error" role="alert">
      <strong>{title}</strong>
      <p>{message}</p>
      {(actionLabel && onAction) || secondaryAction ? (
        <div className="ui-async-actions">
          {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  )
}
