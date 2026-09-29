import { ProgressBar } from '../ui/ProgressBar'
import { StatusBadge } from '../ui/StatusBadge'
import { normalizeArrivalLabel } from '../../domain/campaignSchedule'
import { campaignStatusLabel, type CampaignStatus } from '../../domain/orderWorkflow'
import { formatZhTwTimestamp } from '../../domain/timestamp'
import { useNow } from '../relativeTime'
import { formatResidentRelative } from './residentFormat'

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
  now?: Date
}

export function CampaignSummary({ title, status, priceText, arrivalLabel, closingText, progress, orderCount, openedAt, now }: CampaignSummaryProps) {
  const currentTime = useNow(now)
  const opened = openedAt ? formatResidentRelative(openedAt, currentTime) : ''
  return (
    <section className="resident-card resident-summary" aria-labelledby="campaign-title">
      <div className="resident-summary-main">
        <StatusBadge tone={status === 'open' ? 'success' : 'neutral'}>{campaignStatusLabel(status)}</StatusBadge>
        <h1 id="campaign-title">{title}</h1>
        <p className="resident-summary-price">{priceText}</p>
        <dl className="resident-summary-facts" role="group" aria-label="團購時程">
          <div><dt>預計到貨</dt><dd>{normalizeArrivalLabel(arrivalLabel)}</dd></div>
          <div><dt>{status !== 'open' && closingText ? '原訂結單' : '結單'}</dt><dd>{closingText ?? '未排定'}</dd></div>
        </dl>
      </div>
      <div className="resident-summary-progress">
        <h2>成團進度</h2>
        <p className="resident-summary-progress-text">
          <strong>{progress.text}</strong>
          <span className={progress.formed ? 'is-formed' : undefined}>{progress.remainingText}</span>
        </p>
        <ProgressBar label="成團進度" value={progress.value} max={progress.max} formed={progress.formed} />
        <p className="resident-summary-meta">
          {orderCount} 筆訂單
          {opened && <>・<time dateTime={openedAt!} title={formatZhTwTimestamp(openedAt!)}>{/\d$/.test(opened) ? `${opened} ` : opened}開團</time></>}
        </p>
      </div>
    </section>
  )
}
