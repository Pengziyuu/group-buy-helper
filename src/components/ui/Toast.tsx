import { useEffect, useRef, useState, type ReactNode } from 'react'

type ToastProps = {
  message: ReactNode
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
  duration?: number
  className?: string
}

export function Toast({ message, actionLabel, onAction, onDismiss, duration = 5000, className = '' }: ToastProps) {
  const [paused, setPaused] = useState(false)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => onDismissRef.current(), duration)
    return () => window.clearTimeout(timer)
  }, [paused, duration])

  return (
    <div
      className={`ui-toast ${className}`.trim()}
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false)
      }}
    >
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          className="ui-toast-action"
          onClick={() => {
            onAction()
            onDismiss()
          }}
        >{actionLabel}</button>
      )}
    </div>
  )
}
