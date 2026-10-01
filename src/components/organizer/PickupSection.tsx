import type { CampaignStatus } from '../../domain/orderWorkflow'
import type { PickupNotificationAudience, PickupNotificationPlan } from '../../domain/pickupNotification'
import PickupNotificationPanel from '../../PickupNotificationPanel'
import type { PickupNotificationCommand, PickupNotificationPlanPreview, PickupNotificationResponse } from '../../services/pickupNotificationGateway'
import { EmptyState } from '../ui/AsyncState'

type PickupSectionProps = {
  campaignId: string
  campaignTitle: string
  campaignStatus: CampaignStatus
  published: boolean
  excludedOtherCount: number
  onPreview?: (audience: PickupNotificationAudience, message: string) => Promise<PickupNotificationResponse>
  onCreateCommand?: (audience: PickupNotificationAudience, message: string, previewToken: string) => Promise<PickupNotificationCommand>
  onPreviewPlan?: (plan: PickupNotificationPlan) => Promise<PickupNotificationPlanPreview>
  onCreatePlanCommand?: (plan: PickupNotificationPlan, previewToken: string) => Promise<PickupNotificationCommand>
}

export function PickupSection({ campaignId, campaignTitle, campaignStatus, published, excludedOtherCount, onPreview, onCreateCommand, onPreviewPlan, onCreatePlanCommand }: PickupSectionProps) {
  return (
    <section className="organizer-section" aria-labelledby="pickup-section-heading">
      <h2 id="pickup-section-heading">領取通知</h2>
      {!published ? (
        <p className="organizer-muted">發布並結單後才能發送領取通知。</p>
      ) : campaignStatus === 'open' ? (
        <p className="organizer-muted">結單後才能使用領取通知。</p>
      ) : onPreview && onCreateCommand ? (
        <PickupNotificationPanel
          campaignId={campaignId}
          campaignTitle={campaignTitle}
          campaignStatus={campaignStatus}
          excludedOtherCount={excludedOtherCount}
          onPreview={onPreview}
          onCreateCommand={onCreateCommand}
          onPreviewPlan={onPreviewPlan}
          onCreatePlanCommand={onCreatePlanCommand}
        />
      ) : (
        <EmptyState title="本機示範不提供 LINE 領取通知" description="連接 Supabase 的團主後台才能產生領取通知指令。" />
      )}
    </section>
  )
}
