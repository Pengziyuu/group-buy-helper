import { useEffect, useRef } from 'react'
import { FeedbackMessage } from '../ui/FeedbackMessage'

export type LiveState = 'connecting' | 'live' | 'offline' | 'unavailable'

export function LiveStatus({ state, onRetry }: { state: LiveState; onRetry?: () => void }) {
  const statusRef = useRef<HTMLSpanElement>(null)
  const retryContainerRef = useRef<HTMLDivElement>(null)
  // Set while a retry is outstanding, so keyboard focus is tracked through
  // 重新同步 → connecting → (live or back to offline). Only cleared once the
  // state reaches 'live'; a bounce back to 'offline' before that keeps it
  // set and sends focus back to the 重新同步 button instead of letting it
  // fall to body when the status span disappears.
  const retriedRef = useRef(false)

  useEffect(() => {
    if (!retriedRef.current) return
    if (state === 'live') {
      retriedRef.current = false
    } else if (state === 'connecting') {
      statusRef.current?.focus()
    } else if (state === 'offline') {
      retryContainerRef.current?.querySelector('button')?.focus()
    }
  }, [state])

  if (state === 'unavailable') return null
  if (state === 'offline') {
    return (
      <div ref={retryContainerRef} className="organizer-live-warning">
        <FeedbackMessage
          tone="warning"
          actionLabel={onRetry ? '重新同步' : undefined}
          onAction={onRetry ? () => { retriedRef.current = true; onRetry() } : undefined}
        >
          即時同步中斷，畫面可能不是最新
        </FeedbackMessage>
      </div>
    )
  }
  return (
    <span ref={statusRef} tabIndex={-1} className="organizer-live" data-state={state}>
      {state === 'live' ? '即時更新' : '連線中…'}
    </span>
  )
}
