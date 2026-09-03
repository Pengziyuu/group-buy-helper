import { useEffect, useState } from 'react'
import PickupNotificationPanel from './PickupNotificationPanel'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { FeedbackMessage } from './components/ui/FeedbackMessage'
import type { PickupNotificationAudience } from './domain/pickupNotification'
import type { CampaignListItem } from './services/campaignManagementGateway'
import type { PickupNotificationResponse } from './services/pickupNotificationGateway'
import './NotificationTestLab.css'

type NotificationTestLabProps = {
  campaigns: CampaignListItem[]
  testCampaignIds: string[]
  onSetTestCampaign: (campaignId: string, enabled: boolean) => Promise<void>
  onPreview: (campaignId: string, audience: PickupNotificationAudience, message: string) => Promise<PickupNotificationResponse>
  onSend: (campaignId: string, audience: PickupNotificationAudience, message: string, previewToken: string) => Promise<PickupNotificationResponse>
}

export default function NotificationTestLab({
  campaigns,
  testCampaignIds,
  onSetTestCampaign,
  onPreview,
  onSend,
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
    <main className="notification-lab-shell">
      <header className="notification-lab-header">
        <div>
          <p className="admin-eyebrow">TEST ENVIRONMENT</p>
          <h1>通知測試中心</h1>
          <p>此頁所有通知只會送往測試群組</p>
        </div>
        <a href="/admin">返回團主後台</a>
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
        {eligibleCampaigns.length === 0 && <p>目前沒有已結單或已到貨的團購可供測試。</p>}
        {eligibleCampaigns.map((campaign) => (
          <article key={campaign.id} className="notification-lab-card">
            <div className="notification-lab-card-heading">
              <div>
                <span>{markedIds.has(campaign.id) ? '測試團購' : '尚未標記'}</span>
                <h2>{campaign.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => { setError(''); setTarget({ campaign, enabled: !markedIds.has(campaign.id) }) }}
              >
                將{campaign.title}{markedIds.has(campaign.id) ? '移出' : '加入'}通知測試中心
              </button>
            </div>
            {markedIds.has(campaign.id) && (
              <PickupNotificationPanel
                campaignId={campaign.id}
                campaignTitle={campaign.title}
                campaignStatus={campaign.status}
                mode="test"
                onPreview={(audience, message) => onPreview(campaign.id, audience, message)}
                onSend={(audience, message, previewToken) => onSend(campaign.id, audience, message, previewToken)}
              />
            )}
          </article>
        ))}
      </section>
    </main>
  )
}
