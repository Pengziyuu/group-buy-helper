import { ProgressBar } from '../ui/ProgressBar'
import { StatusBadge } from '../ui/StatusBadge'
import { normalizeArrivalLabel } from '../../domain/campaignSchedule'
import { campaignStatusLabel, type CampaignStatus } from '../../domain/orderWorkflow'
import { formatZhTwTimestamp } from '../../domain/timestamp'

export type CampaignProgress = {
  value: number
  max: number
  text: string
  remainingText: string
  formed: boolean
}

type CampaignSummaryProps = {
  title: string
  status: CampaignStatus
  priceText: string
  arrivalLabel?: string
  closingText: string | null
  progress: CampaignProgress
  orderCount: number
  openedAt: string | null
}

export function CampaignSummary({ title, status, priceText, arrivalLabel, closingText, progress, orderCount, openedAt }: CampaignSummaryProps) {
  return (
    <section className="resident-card resident-summary" aria-labelledby="campaign-title">
      <div className="resident-summary-main">
        <StatusBadge tone={status === 'open' ? 'success' : 'neutral'}>{campaignStatusLabel(status)}</StatusBadge>
        <h1 id="campaign-title">{title}</h1>
        <p className="resident-summary-price">{priceText}</p>
        <dl className="resident-summary-facts">
          <div><dt>預計到貨</dt><dd>{normalizeArrivalLabel(arrivalLabel)}</dd></div>
          {closingText && <div><dt>結單</dt><dd>{closingText}</dd></div>}
        </dl>
      </div>
      <div className="resident-summary-progress">
        <p className="resident-summary-progress-text">
          <strong>{progress.text}</strong>
          <span className={progress.formed ? 'is-formed' : undefined}>{progress.remainingText}</span>
        </p>
        <ProgressBar label="成團進度" value={progress.value} max={progress.max} />
        <p className="resident-summary-meta">
          已有 {orderCount} 筆訂單{openedAt ? `・開團 ${formatZhTwTimestamp(openedAt)}` : ''}
        </p>
      </div>
    </section>
  )
}
