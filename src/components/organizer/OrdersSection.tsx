import { useEffect, useState } from 'react'
import type { OrganizerOrderRow, OrganizerOrderSummary } from '../../domain/adminOrders'
import type { CampaignStatus } from '../../domain/orderWorkflow'
import { campaignSectionPath } from '../../routing'
import { EmptyState } from '../ui/AsyncState'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import { Avatar } from '../ui/Avatar'
import { Menu } from '../ui/Menu'
import { SegmentedControl } from '../ui/SegmentedControl'
import { ExportOrdersButton } from './ExportOrdersButton'
import { LiveStatus, type LiveState } from './LiveStatus'
import { readLastSeen, writeLastSeen } from './lastSeenStore'
import { OrganizerLink } from './OrganizerLink'
import { OrderNoteCell } from './OrderNoteCell'
import { OrderSummaryCard } from './OrderSummaryCard'
import {
  countOrdersOnTaipeiDay, isNewSince, matchesOrderSearch, orderControlLabel, orderHouseholdLabel, orderItemChips, orderItemChipText, sortOrders, wasEdited, type OrderSort,
} from './orderView'
import { EditedMark, RelativeTime, useNow } from '../relativeTime'

const currency = (amount: number) => `$${amount.toLocaleString('en-US')}`

type OrdersSectionProps = {
  campaignId?: string
  campaignTitle: string
  openedAt: string | null
  summary: OrganizerOrderSummary
  status: CampaignStatus
  liveState: LiveState
  onRetrySync?: () => void
  onSetOrderOrganizerNote?: (orderId: string, note: string) => Promise<void>
  onCancelOrder?: (orderId: string) => Promise<void>
  onExport?: () => Promise<void>
  now?: Date
}

export function OrdersSection({
  campaignId, campaignTitle, openedAt, summary, status, liveState, onRetrySync, onSetOrderOrganizerNote, onCancelOrder, onExport, now,
}: OrdersSectionProps) {
  // Capture the previous visit before recording this one; a refresh does not erase its markers.
  const [lastSeen] = useState(() => campaignId ? readLastSeen(campaignId) : null)
  useEffect(() => { if (campaignId) writeLastSeen(campaignId, new Date().toISOString()) }, [campaignId])
  const [query, setQuery] = useState('')
  // While open the newest orders (and those marked 新) come first; once closed, households, for handing out.
  const [sort, setSort] = useState<OrderSort>(() => status === 'open' ? 'orderedAt' : 'household')
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set())
  const [cancelTarget, setCancelTarget] = useState<OrganizerOrderRow | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const currentTime = useNow(now)
  const unit = summary.quantityUnit
  const rows = sortOrders(summary.orderRows.filter((order) => matchesOrderSearch(order, query)), sort)
  const updatedSinceLastVisit = summary.orderRows.filter((order) => isNewSince(order, lastSeen)).length

  const setBusy = (orderId: string, busy: boolean) => setBusyIds((current) => {
    const next = new Set(current)
    if (busy) next.add(orderId)
    else next.delete(orderId)
    return next
  })

  const confirmCancel = async () => {
    if (!cancelTarget || !onCancelOrder || cancelling) return
    const target = cancelTarget
    setCancelling(true)
    setCancelError('')
    setBusy(target.orderId, true)
    try {
      await onCancelOrder(target.orderId)
      setCancelTarget(null)
    } catch (cancelFailure) {
      setCancelError(cancelFailure instanceof Error ? cancelFailure.message : '取消訂單失敗')
    } finally {
      setCancelling(false)
      setBusy(target.orderId, false)
    }
  }

  return (
    <section className="organizer-section organizer-orders" aria-labelledby="orders-heading">
      <div className="organizer-section-heading">
        <h2 id="orders-heading">訂單</h2>
        <LiveStatus state={liveState} onRetry={onRetrySync} />
        {/* Export only works once orders stop changing, so it appears after closing instead of sitting disabled. */}
        {status !== 'open' && <ExportOrdersButton summary={summary} campaignTitle={campaignTitle} openedAt={openedAt} status={status} onExport={onExport} />}
      </div>

      {status !== 'open' && campaignId && (
        <p className="organizer-section-note">已結單。可以匯出 Excel 核對，並到<OrganizerLink href={campaignSectionPath(campaignId, 'pickup')}>領取通知</OrganizerLink>通知住戶領貨。</p>
      )}
      <OrderSummaryCard
        campaignTitle={campaignTitle}
        summary={summary}
        status={status}
        ordersToday={countOrdersOnTaipeiDay(summary.orderRows, currentTime)}
      />

      {summary.orderRows.length === 0 ? (
        <EmptyState title="還沒有人下單" description="把住戶連結分享到群組後，訂單會出現在這裡。" />
      ) : (
        <>
          <div className="organizer-toolbar">
            <input
              className="ui-input"
              type="search"
              aria-label="搜尋訂單"
              placeholder="搜尋名字或戶號"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <SegmentedControl
              label="訂單排序"
              value={sort}
              onChange={setSort}
              options={[{ value: 'household', label: '戶號' }, { value: 'orderedAt', label: '下單時間' }]}
            />
            <p className="organizer-toolbar-count">
              {query ? `符合 ${rows.length} 筆` : `共 ${summary.orderCount} 筆`}
              {updatedSinceLastVisit > 0 && <span className="organizer-toolbar-new">{`・${updatedSinceLastVisit} 筆上次查看後有更新`}</span>}
            </p>
          </div>
          {rows.length === 0 ? <p className="organizer-muted">沒有符合的訂單。</p> : (
            <div className="organizer-table-wrap">
              <table className="organizer-table organizer-order-table" aria-label="訂單列表">
                <thead>
                  <tr>
                    <th scope="col">戶號・姓名</th>
                    <th scope="col">訂購內容</th>
                    <th scope="col">數量</th>
                    <th scope="col">金額</th>
                    <th scope="col">下單時間</th>
                    <th scope="col">團主備註</th>
                    <th scope="col"><span className="ui-visually-hidden">操作</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((order) => {
                    const controlLabel = orderControlLabel(order)
                    const busy = busyIds.has(order.orderId)
                    const chips = orderItemChips(order, summary.itemRows)
                    return (
                      <tr key={order.orderId} aria-busy={busy || undefined}>
                        <th scope="row">
                          <span className="organizer-order-person">
                            <Avatar className="organizer-avatar" name={order.name} pictureUrl={order.pictureUrl} />
                            <span>
                              <span className="organizer-order-household">{orderHouseholdLabel(order)}</span>
                              {' '}<strong>{order.name}</strong>
                              {isNewSince(order, lastSeen) && (
                                <span className="organizer-new-badge"><span aria-hidden="true">新</span><span className="ui-visually-hidden">上次查看後有更新</span></span>
                              )}
                            </span>
                          </span>
                        </th>
                        <td data-label="訂購內容" className="organizer-cell-items">
                          {chips.length === 0 ? <span className="organizer-muted">無正式品項</span> : (
                            <span className="organizer-chips">
                              {chips.map((chip) => (
                                <span key={chip.key} className={chip.custom ? 'organizer-chip is-custom' : 'organizer-chip'} title={chip.custom ? undefined : chip.name}>
                                  {orderItemChipText(chip)}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td data-label="數量" className="organizer-cell-fact ui-num">{order.quantity} {unit}</td>
                        <td data-label="金額" className="organizer-cell-fact ui-num">
                          <span>
                            {currency(order.amount)}
                            {order.customItemSummary && <small className="organizer-muted"> ＋另計</small>}
                          </span>
                        </td>
                        <td data-label="下單時間" className="organizer-cell-fact organizer-order-time">
                          {/* One wrapper, so phone cards keep "已修改" under its time. */}
                          <span>
                            <RelativeTime value={order.orderedAt} now={currentTime} withTime />
                            {wasEdited(order) && (
                              <small><EditedMark value={order.updatedAt} /></small>
                            )}
                          </span>
                        </td>
                        <td data-label="團主備註" className="organizer-cell-note">
                          <OrderNoteCell
                            order={order}
                            controlLabel={controlLabel}
                            disabled={busy}
                            onSave={onSetOrderOrganizerNote ? (note) => onSetOrderOrganizerNote(order.orderId, note) : undefined}
                            onSavingChange={(saving) => setBusy(order.orderId, saving)}
                          />
                        </td>
                        <td className="organizer-cell-actions">
                          {status === 'open' && onCancelOrder && (
                            <Menu
                              size="sm"
                              label={`更多操作 ${controlLabel}・${order.name}`}
                              items={[{
                                label: '取消整筆訂單',
                                ariaLabel: `取消 ${controlLabel} 訂單`,
                                tone: 'danger',
                                disabled: busy,
                                onSelect: () => { setCancelError(''); setCancelTarget(order) },
                              }]}
                            />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {cancelTarget && (
        <ConfirmDialog
          title="確認取消訂單"
          confirmLabel="確認取消訂單"
          cancelLabel="返回"
          busy={cancelling}
          onCancel={() => { setCancelError(''); setCancelTarget(null) }}
          onConfirm={() => { void confirmCancel() }}
        >
          <p>確定要整筆取消「{orderHouseholdLabel(cancelTarget)}・{cancelTarget.name}」的訂單嗎？共 {cancelTarget.quantity} {unit}、{currency(cancelTarget.amount)}。</p>
          <p>取消後訂單與明細直接刪除，無法復原。住戶若要重新下單，需自行再次送出。</p>
          {cancelError && <FeedbackMessage tone="error">{cancelError}</FeedbackMessage>}
        </ConfirmDialog>
      )}
    </section>
  )
}
