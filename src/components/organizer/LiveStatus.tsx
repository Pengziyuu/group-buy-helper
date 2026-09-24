import { FeedbackMessage } from '../ui/FeedbackMessage'

export type LiveState = 'connecting' | 'live' | 'offline' | 'unavailable'

export function LiveStatus({ state, onRetry }: { state: LiveState; onRetry?: () => void }) {
  if (state === 'unavailable') return null
  if (state === 'offline') {
    return (
      <FeedbackMessage tone="warning" className="organizer-live-warning" actionLabel={onRetry ? '重新同步' : undefined} onAction={onRetry}>
        即時同步中斷，畫面可能不是最新
      </FeedbackMessage>
    )
  }
  return <span className="organizer-live" data-state={state}>{state === 'live' ? '即時更新' : '連線中…'}</span>
}
