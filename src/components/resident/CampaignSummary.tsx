import { ProgressBar } from '../ui/ProgressBar'
import { StatusBadge } from '../ui/StatusBadge'
import { campaignStatusLabel, type CampaignStatus } from '../../domain/orderWorkflow'
import { formatZhTwTimestamp } from '../../domain/timestamp'
import { formatRelativeTime, useNow } from '../relativeTime'
import type { ClosingFact, ScheduleFact } from './residentSchedule'

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
  schedule: { closing: ClosingFact | null; arrival: ScheduleFact }
  progress: CampaignProgress
  orderCount: number
  openedAt: string | null
  now?: Date
}

export function CampaignSummary({ title, status, priceText, schedule, progress, orderCount, openedAt, now }: CampaignSummaryProps) {
  const currentTime = useNow(now)
  const opened = openedAt ? formatRelativeTime(openedAt, currentTime) : ''
  return (
    <section className="resident-card resident-summary" aria-labelledby="campaign-title">
      <div className="resident-summary-main">
        <StatusBadge tone={status === 'open' ? 'success' : 'neutral'}>{campaignStatusLabel(status)}</StatusBadge>
        <h1 id="campaign-title">{title}</h1>
        <p className="resident-summary-price">{priceText}</p>
        <dl className="resident-summary-facts" role="group" aria-label="團購時程">
          <div>
            <dt>結單</dt>
            <dd>{schedule.closing?.value ?? '已結單'}</dd>
            {schedule.closing?.note && <dd className="resident-summary-fact-note">{schedule.closing.note}</dd>}
          </div>
          <div><dt>預計到貨</dt><dd>{schedule.arrival.value}</dd></div>
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
