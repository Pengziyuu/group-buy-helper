import { useEffect, useRef } from 'react'
import { FeedbackMessage } from '../ui/FeedbackMessage'

export type LiveState = 'connecting' | 'live' | 'offline' | 'unavailable'

export function LiveStatus({ state, onRetry }: { state: LiveState; onRetry?: () => void }) {
  const statusRef = useRef<HTMLSpanElement>(null)
  const retriedRef = useRef(false)

  // The retry button disappears as soon as the retry starts; keep keyboard users on the status that replaces it.
  useEffect(() => {
    if (!retriedRef.current || state === 'offline') return
    retriedRef.current = false
    statusRef.current?.focus()
  }, [state])

  if (state === 'unavailable') return null
  if (state === 'offline') {
    return (
      <FeedbackMessage
        tone="warning"
        className="organizer-live-warning"
        actionLabel={onRetry ? '重新同步' : undefined}
        onAction={onRetry ? () => { retriedRef.current = true; onRetry() } : undefined}
      >
        即時同步中斷，畫面可能不是最新
      </FeedbackMessage>
    )
  }
  return (
    <span ref={statusRef} tabIndex={-1} className="organizer-live" data-state={state}>
      {state === 'live' ? '即時更新' : '連線中…'}
    </span>
  )
}
