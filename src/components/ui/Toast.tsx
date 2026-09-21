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
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hovered || focused
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
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
