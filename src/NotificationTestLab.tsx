import { useEffect, useState } from 'react'
import PickupNotificationPanel from './PickupNotificationPanel'
import { OrganizerLink } from './components/organizer/OrganizerLink'
import { Button } from './components/ui/Button'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { FeedbackMessage } from './components/ui/FeedbackMessage'
import { StatusBadge } from './components/ui/StatusBadge'
import type { PickupNotificationAudience } from './domain/pickupNotification'
import type { CampaignListItem } from './services/campaignManagementGateway'
import type { PickupNotificationCommand, PickupNotificationResponse } from './services/pickupNotificationGateway'
import './NotificationTestLab.css'

type NotificationTestLabProps = {
  campaigns: CampaignListItem[]
  testCampaignIds: string[]
  onSetTestCampaign: (campaignId: string, enabled: boolean) => Promise<void>
  onPreview: (campaignId: string, audience: PickupNotificationAudience, message: string) => Promise<PickupNotificationResponse>
  onCreateCommand: (campaignId: string, audience: PickupNotificationAudience, message: string, previewToken: string) => Promise<PickupNotificationCommand>
}

export default function NotificationTestLab({
  campaigns,
  testCampaignIds,
  onSetTestCampaign,
  onPreview,
  onCreateCommand,
}: NotificationTestLabProps) {
  const [markedIds, setMarkedIds] = useState(() => new Set(testCampaignIds))
  const [target, setTarget] = useState<{ campaign: CampaignListItem; enabled: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setMarkedIds(new Set(testCampaignIds)), [testCampaignIds])

  const eligibleCampaigns = campaigns.filter((campaign) =>
    Boolean(campaign.openedAt) && (campaign.status === 'closed' || campaign.status === 'arrived'))

  const confirmChange = async () => {
    if (!target || busy) return
    setBusy(true)
    setError('')
    try {
      await onSetTestCampaign(target.campaign.id, target.enabled)
      setMarkedIds((current) => {
        const next = new Set(current)
        if (target.enabled) next.add(target.campaign.id)
        else next.delete(target.campaign.id)
        return next
      })
      setTarget(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '無法更新通知測試團購')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="organizer-page notification-lab">
      <OrganizerLink className="notification-lab-back" href="/admin/settings"><span aria-hidden="true">‹ </span>返回設定</OrganizerLink>
      <header className="notification-lab-header">
        <p className="admin-eyebrow">TEST ENVIRONMENT</p>
        <h1>通知測試中心</h1>
        <p className="organizer-muted">此頁只能產生測試群組使用的指令；通知會在您將指令貼到測試群組後，由機器人回覆。</p>
      </header>

      <FeedbackMessage tone="warning" urgent>
        測試與正式通知已由後端強制隔離。測試訊息會自動加上「【測試】」，此頁不能指定正式群組。
      </FeedbackMessage>

      {target && (
        <ConfirmDialog
          title={target.enabled ? '加入通知測試中心' : '移出通知測試中心'}
          confirmLabel={target.enabled ? '確認加入測試中心' : '確認移出測試中心'}
          cancelLabel="取消"
          busy={busy}
          onCancel={() => { setTarget(null); setError('') }}
          onConfirm={() => { void confirmChange() }}
        >
          <p>{target.enabled ? '確定將' : '確定把'}「{target.campaign.title}」{target.enabled ? '標記為通知測試團購' : '移出通知測試中心'}嗎？</p>
          <p>{target.enabled ? '標記期間，這個團購不能從正式通知介面發送。' : '移出後，這個團購將只能從正式通知介面發送。'}</p>
          {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
        </ConfirmDialog>
      )}

      <section className="notification-lab-list" aria-label="可測試的已完成團購">
        {eligibleCampaigns.length === 0 && <p className="organizer-muted">目前沒有已結單的團購可供測試。</p>}
        {eligibleCampaigns.map((campaign) => {
          const marked = markedIds.has(campaign.id)
          return (
          <article key={campaign.id} className="notification-lab-card">
            <div className="notification-lab-card-heading">
              <div>
                <StatusBadge tone={marked ? 'warning' : 'neutral'}>{marked ? '測試團購' : '尚未標記'}</StatusBadge>
                <h2>{campaign.title}</h2>
              </div>
              <Button
                variant="secondary"
                size="sm"
                aria-label={`將${campaign.title}${marked ? '移出' : '加入'}通知測試中心`}
                onClick={() => { setError(''); setTarget({ campaign, enabled: !marked }) }}
              >
                {marked ? '移出測試中心' : '加入測試中心'}
              </Button>
            </div>
            {marked && (
              <PickupNotificationPanel
                campaignId={campaign.id}
                campaignTitle={campaign.title}
                campaignStatus={campaign.status}
                mode="test"
                onPreview={(audience, message) => onPreview(campaign.id, audience, message)}
                onCreateCommand={(audience, message, previewToken) => onCreateCommand(campaign.id, audience, message, previewToken)}
              />
            )}
          </article>
          )
        })}
      </section>
    </main>
  )
}
