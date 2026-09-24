import { useEffect, useState } from 'react'
import type { OrganizerOrderSummary } from '../../domain/adminOrders'
import type { CampaignStatus } from '../../domain/orderWorkflow'
import { campaignSectionPath } from '../../routing'
import { ProgressBar } from '../ui/ProgressBar'
import { ExportOrdersButton } from './ExportOrdersButton'
import { readLastSeen, writeLastSeen } from './lastSeenStore'
import { LiveStatus, type LiveState } from './LiveStatus'
import { OrganizerLink } from './OrganizerLink'
import { useNow } from '../relativeTime'
import {
  countOrdersOnTaipeiDay, formatRelativeTime, isNewSince, latestOrders, orderHouseholdLabel, orderItemChips, wasEdited,
} from './orderView'

const currency = (amount: number) => `$${amount.toLocaleString('en-US')}`

type OverviewSectionProps = {
  campaignId: string
  campaignTitle: string
  openedAt: string | null
  summary: OrganizerOrderSummary
  status: CampaignStatus
  liveState: LiveState
  onRetrySync?: () => void
  now?: Date
}

export function OverviewSection({ campaignId, campaignTitle, openedAt, summary, status, liveState, onRetrySync, now }: OverviewSectionProps) {
  // Read before this visit is recorded, so "new" means new since the previous visit.
  const [lastSeen] = useState(() => readLastSeen(campaignId))
  useEffect(() => { writeLastSeen(campaignId, new Date().toISOString()) }, [campaignId])

  const today = useNow(now)
  const closed = status !== 'open'
  const usesAmount = summary.thresholdKind === 'amount'
  const unit = summary.quantityUnit
  const progressValue = usesAmount ? summary.amount : summary.quantity
  const progressText = usesAmount
    ? `${currency(summary.amount)} / ${currency(summary.threshold)}`
    : `${summary.quantity} / ${summary.threshold} ${unit}`
  const remainingText = summary.formed
    ? '已成團'
    : usesAmount ? `還差 ${currency(summary.remaining)} 成團` : `還差 ${summary.remaining} ${unit}成團`
  const latest = latestOrders(summary.orderRows)
  const largestItem = Math.max(1, ...summary.itemRows.map((item) => item.quantity))

  return (
    <section className="organizer-section organizer-overview" aria-labelledby="overview-heading">
      <div className="organizer-section-heading">
        <h2 id="overview-heading">概況</h2>
        <LiveStatus state={liveState} onRetry={onRetrySync} />
        {closed && <ExportOrdersButton summary={summary} campaignTitle={campaignTitle} openedAt={openedAt} status={status} />}
      </div>
      {closed && (
        <p className="organizer-section-note">
          已結單。可以匯出 Excel 核對，並到<OrganizerLink href={campaignSectionPath(campaignId, 'pickup')}>領取通知</OrganizerLink>通知住戶領貨。
        </p>
      )}

      <ul className="organizer-kpis" aria-label="團購數字">
        <li className="organizer-kpi is-progress">
          <span>成團進度</span>
          <strong className="ui-num">{progressText}</strong>
          <ProgressBar label="成團進度" value={progressValue} max={summary.threshold} />
          <small>{remainingText}</small>
        </li>
        <li className="organizer-kpi"><span>訂單</span><strong className="ui-num">{summary.orderCount} 筆</strong></li>
        <li className="organizer-kpi"><span>預估總額</span><strong className="ui-num">{currency(summary.amount)}</strong></li>
        {closed
          ? <li className="organizer-kpi"><span>總數量</span><strong className="ui-num">{summary.quantity} {unit}</strong></li>
          : <li className="organizer-kpi"><span>今天新增</span><strong className="ui-num">{countOrdersOnTaipeiDay(summary.orderRows, today)} 筆</strong></li>}
      </ul>

      <div className="organizer-overview-columns">
        <section className="organizer-panel" aria-labelledby="overview-items-heading">
          <h3 id="overview-items-heading">品項數量</h3>
          <ul className="organizer-item-bars" aria-label="品項數量">
            {summary.itemRows.map((item) => (
              <li key={item.code}>
                <span className="organizer-item-code">{item.label}</span>
                <span className="organizer-item-name">{item.name}</span>
                <span className="organizer-item-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round((item.quantity / largestItem) * 100)}%` }} />
                </span>
                <strong className="ui-num">{item.quantity}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="organizer-panel" aria-labelledby="overview-latest-heading">
          <div className="organizer-panel-heading">
            <h3 id="overview-latest-heading">最新訂單</h3>
            {summary.orderCount > 0 && (
              <OrganizerLink href={campaignSectionPath(campaignId, 'orders')}>查看全部 {summary.orderCount} 筆</OrganizerLink>
            )}
          </div>
          {latest.length === 0 ? <p className="organizer-muted">還沒有人下單。</p> : (
            <ol className="organizer-latest" aria-label="最新訂單">
              {latest.map((order) => (
                <li key={order.orderId}>
                  {isNewSince(order, lastSeen)
                    ? <span className="organizer-new-dot"><span className="ui-visually-hidden">上次查看後有更新</span></span>
                    : <span aria-hidden="true" />}
                  <span className="organizer-latest-who"><strong>{order.name}</strong><small>{orderHouseholdLabel(order)}</small></span>
                  <span className="organizer-chips">
                    {orderItemChips(order, summary.itemRows).map((chip) => (
                      <span key={chip.key} className={chip.custom ? 'organizer-chip is-custom' : 'organizer-chip'} title={chip.custom ? undefined : chip.name}>
                        {chip.custom ? `${chip.label} ×${chip.quantity}・另計` : `${chip.label} ${chip.quantity}`}
                      </span>
                    ))}
                  </span>
                  <span className="organizer-latest-meta">
                    <span className="ui-num">{order.quantity} {unit}・{currency(order.amount)}</span>
                    <small>{wasEdited(order) ? '已修改・' : ''}{formatRelativeTime(order.updatedAt ?? order.orderedAt, today)}</small>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  )
}
