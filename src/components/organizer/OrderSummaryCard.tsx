import { useState } from 'react'
import type { OrganizerOrderSummary } from '../../domain/adminOrders'
import type { CampaignStatus } from '../../domain/orderWorkflow'
import { Button } from '../ui/Button'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { ProgressBar } from '../ui/ProgressBar'
import { copyText } from './copyResidentLink'
import { Copy, Pencil } from 'lucide-react'
import { Icon } from '../ui/Icon'

const currency = (amount: number) => `$${amount.toLocaleString('en-US')}`

type OrderSummaryCardProps = {
  campaignTitle: string
  summary: OrganizerOrderSummary
  status: CampaignStatus
  ordersToday: number
}

/** Plain lines for the supplier: the campaign, each ordered item, custom items, and the total. Unordered items are left out. */
export function itemQuantitiesText(campaignTitle: string, summary: OrganizerOrderSummary): string {
  const unit = summary.quantityUnit
  const lines = summary.itemRows
    .filter((item) => item.quantity > 0)
    .map((item) => `${item.name.trim()} ${item.quantity} ${unit}`)
  const customLines = summary.customItemRows.map((item) => `${item.name}（額外品項） ${item.quantity} ${unit}`)
  return [campaignTitle, ...lines, ...customLines, `合計 ${summary.quantity} ${unit}`].join('\n')
}

/** One card: formation progress, the order totals, and an aligned per-item tally that can be copied. */
export function OrderSummaryCard({ campaignTitle, summary, status, ordersToday }: OrderSummaryCardProps) {
  const [copyFeedback, setCopyFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const unit = summary.quantityUnit
  const usesAmount = summary.thresholdKind === 'amount'
  const progressValue = usesAmount ? summary.amount : summary.quantity
  const reached = usesAmount ? currency(summary.amount) : `${summary.quantity} ${unit}`
  const threshold = usesAmount ? currency(summary.threshold) : `${summary.threshold} ${unit}`
  const surplus = usesAmount ? currency(summary.amount - summary.threshold) : `${summary.quantity - summary.threshold} ${unit}`

  // Bars measure each item against the most-ordered one, custom items included.
  const largest = Math.max(1, ...summary.itemRows.map((item) => item.quantity), ...summary.customItemRows.map((item) => item.quantity))
  const bar = (quantity: number) => (
    <span className="organizer-item-bar" aria-hidden="true"><span style={{ width: `${Math.round((quantity / largest) * 100)}%` }} /></span>
  )

  const copyItems = async () => {
    try {
      await copyText(itemQuantitiesText(campaignTitle, summary))
      setCopyFeedback({ tone: 'success', text: '已複製' })
    } catch (failure) {
      setCopyFeedback({ tone: 'error', text: failure instanceof Error ? failure.message : '複製失敗' })
    }
  }

  return (
    <section className="organizer-order-overview" aria-label="訂單摘要">
      <div className="organizer-order-overview-top">
        <div className="organizer-order-progress" aria-label="成團進度摘要">
          {/* Past the threshold, a fraction like 27 / 14 reads as a typo; say it is formed and by how much. */}
          {summary.formed ? (
            <p>
              <strong className="is-formed">已成團</strong>
              <span className="ui-num">{reached}</span>
              <small>{`門檻 ${threshold}${progressValue > summary.threshold ? `・超過 ${surplus}` : ''}`}{status === 'open' ? '・仍可下單' : ''}</small>
            </p>
          ) : (
            <p>
              <span>成團進度</span>
              <strong className="ui-num">{usesAmount ? `${currency(summary.amount)} / ${currency(summary.threshold)}` : `${summary.quantity} / ${summary.threshold} ${unit}`}</strong>
              <small>{usesAmount ? `還差 ${currency(summary.remaining)} 成團` : `還差 ${summary.remaining} ${unit}成團`}</small>
            </p>
          )}
          <ProgressBar label="成團進度" value={progressValue} max={summary.threshold} formed={summary.formed} />
        </div>
        <dl className="organizer-order-totals" aria-label="訂單總覽">
          <div><dt>訂單</dt><dd>{summary.orderCount} 筆</dd></div>
          {/* With a quantity threshold the progress line already shows the total quantity. */}
          {usesAmount && <div><dt>總數量</dt><dd>{summary.quantity} {unit}</dd></div>}
          <div><dt>總額</dt><dd>{currency(summary.amount)}</dd></div>
          {status === 'open' && <div><dt>今天</dt><dd>+{ordersToday} 筆</dd></div>}
        </dl>
      </div>

      {/* Folded by default so the order list stays close to the top; opened when tallying or ordering from the supplier. */}
      <details className="organizer-item-tally-block">
        <summary>品項數量 <small>{`${summary.itemRows.length + summary.customItemRows.length} 項・合計 ${summary.quantity} ${unit}`}</small></summary>
        <div className="organizer-item-tally-actions">
          <Button size="sm" variant="utility" onClick={() => { void copyItems() }}><Icon icon={Copy} />複製品項數量</Button>
          {copyFeedback && <FeedbackMessage tone={copyFeedback.tone}>{copyFeedback.text}</FeedbackMessage>}
        </div>
        {/* One aligned column, so the list can be scanned, screenshotted or copied for the supplier. */}
        <ol className="organizer-item-tally" aria-label="品項數量">
          {summary.itemRows.map((item) => (
            <li key={item.code} data-empty={item.quantity === 0 || undefined}>
              <span className="organizer-item-code">{item.label}</span>
              <span className="organizer-item-name">{item.name}</span>
              {bar(item.quantity)}
              <strong className="ui-num">{item.quantity} {unit}</strong>
            </li>
          ))}
          {/* Custom items carry the pencil residents see beside them, and an amber bar. */}
          {summary.customItemRows.map((item) => (
            <li key={`custom-${item.name}`} className="is-custom">
              <span className="organizer-item-code" role="img" aria-label="額外品項">
                <Icon icon={Pencil} size={14} />
              </span>
              <span className="organizer-item-name">{item.name}</span>
              {bar(item.quantity)}
              <strong className="ui-num">{item.quantity} {unit}</strong>
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}
