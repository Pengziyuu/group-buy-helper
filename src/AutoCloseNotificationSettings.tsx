import { useEffect, useState } from 'react'
import { Button } from './components/ui/Button'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { FeedbackMessage } from './components/ui/FeedbackMessage'
import { StatusBadge } from './components/ui/StatusBadge'
import type { AutoCloseNotificationSettingState } from './services/autoCloseNotificationSettingsGateway'
import './AutoCloseNotificationSettings.css'

type Props = {
  state: AutoCloseNotificationSettingState
  onSelectCurrentUser: () => Promise<void>
}

const stateMessage: Record<AutoCloseNotificationSettingState, string> = {
  unconfigured: '尚未設定通知團主。自動結單仍會完成，但設定前不會傳送 LINE 通知。',
  current_user: '目前由你的 LINE 帳號接收自動結單通知。',
  other_organizer: '目前已由另一位已核准團主接收通知。',
}

export default function AutoCloseNotificationSettings({ state, onSelectCurrentUser }: Props) {
  const [currentState, setCurrentState] = useState(state)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setCurrentState(state)
    setFeedback('')
    setError('')
  }, [state])

  const selectCurrentUser = async () => {
    if (saving || currentState === 'current_user') return
    setConfirming(false)
    setSaving(true)
    setFeedback('')
    setError('')
    try {
      await onSelectCurrentUser()
      setCurrentState('current_user')
      setFeedback('已將你設為自動結單通知接收者。')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '暫時無法儲存')
    } finally {
      setSaving(false)
    }
  }

  const buttonLabel = currentState === 'other_organizer'
      ? '改由我接收通知'
      : '將我設為通知接收者'

  return (
    <section className="organizer-settings-section auto-close-notification-settings" aria-labelledby="auto-close-notification-heading">
      <div className="auto-close-notification-heading">
        <div>
          <p className="auto-close-notification-eyebrow">LINE 主動通知</p>
          <h2 id="auto-close-notification-heading">自動結單通知</h2>
        </div>
        <StatusBadge tone="neutral">單一收件者</StatusBadge>
      </div>
      <p>每次因結單時間到期或啟用的成團門檻達標而自動結單時，只通知一位團主，約使用 1 則主動訊息。</p>
      <p className="auto-close-notification-state" data-tone={currentState === 'current_user' ? 'success' : 'neutral'}>
        {stateMessage[currentState]}
      </p>
      {currentState !== 'current_user' && <Button
        size="sm"
        loading={saving}
        loadingLabel="設定中…"
        onClick={() => { setFeedback(''); setError(''); setConfirming(true) }}
      >{buttonLabel}</Button>}
      {feedback && <FeedbackMessage tone="success">{feedback}</FeedbackMessage>}
      {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
      {/* Easy to tap by mistake, and it changes who LINE notifies, so ask first. */}
      {confirming && (
        <ConfirmDialog
          title="由你接收自動結單通知？"
          confirmLabel="確認由我接收"
          destructive={false}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { void selectCurrentUser() }}
        >
          <p>{currentState === 'other_organizer'
            ? '之後自動結單時改由你的 LINE 收到通知，原本的團主就不會再收到。'
            : '之後每次自動結單，都會用 LINE 通知你。'}</p>
        </ConfirmDialog>
      )}
    </section>
  )
}
