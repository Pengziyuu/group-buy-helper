import { useState } from 'react'
import AutoCloseNotificationSettings from '../../AutoCloseNotificationSettings'
import type { AutoCloseNotificationSettingState } from '../../services/autoCloseNotificationSettingsGateway'
import { Button } from '../ui/Button'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { OrganizerLink } from './OrganizerLink'

type OrganizerSettingsProps = {
  autoCloseNotificationState?: AutoCloseNotificationSettingState
  onSelectCurrentUserForAutoCloseNotification?: () => Promise<void>
  onSignOut?: () => Promise<void>
}

export function OrganizerSettings({ autoCloseNotificationState, onSelectCurrentUserForAutoCloseNotification, onSignOut }: OrganizerSettingsProps) {
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  return (
    <main className="organizer-page organizer-settings">
      <h1>設定</h1>
      {autoCloseNotificationState && onSelectCurrentUserForAutoCloseNotification && (
        <AutoCloseNotificationSettings
          state={autoCloseNotificationState}
          onSelectCurrentUser={onSelectCurrentUserForAutoCloseNotification}
        />
      )}
      <section className="organizer-settings-section" aria-labelledby="notification-lab-heading">
        <h2 id="notification-lab-heading">通知測試中心</h2>
        <p>用測試群組試發領取通知，不會通知正式社區。</p>
        <OrganizerLink className="ui-button" data-variant="secondary" data-size="sm" href="/admin/notification-lab">開啟通知測試中心</OrganizerLink>
      </section>
      {onSignOut && (
        <section className="organizer-settings-section" aria-labelledby="account-heading">
          <h2 id="account-heading">帳號</h2>
          {signOutError && (
            <FeedbackMessage tone="error">{signOutError}</FeedbackMessage>
          )}
          <Button
            variant="secondary"
            size="sm"
            loading={signingOut}
            loadingLabel="正在登出…"
            onClick={async () => {
              setSigningOut(true)
              setSignOutError(null)
              try {
                await onSignOut()
              } catch (error) {
                setSignOutError(`登出失敗：${error instanceof Error ? error.message : String(error)}`)
              } finally {
                setSigningOut(false)
              }
            }}
          >登出</Button>
        </section>
      )}
    </main>
  )
}
