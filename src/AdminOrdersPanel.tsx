import { useRef, useState } from 'react'
import type { OrganizerOrderSummary, OrganizerOrderRow } from './domain/adminOrders'
import type { PickupNotificationAudience } from './domain/pickupNotification'
import type { PickupNotificationResponse } from './services/pickupNotificationGateway'
import PickupNotificationPanel from './PickupNotificationPanel'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { buildOrderExportRows, downloadOrderExport } from './services/orderExport'
import {
  campaignStatusAction,
  campaignStatusLabel,
  type CampaignStatus,
} from './domain/orderWorkflow'
import './AdminOrdersPanel.css'

const currency = (amount: number) => `$${amount.toLocaleString('en-US')}`
const periodLabel = (period: number) => `${period === 1 ? '一期' : period === 2 ? '二期' : `${period}期`}`

type AdminOrdersPanelProps = {
  summary: OrganizerOrderSummary
  campaignStatus?: CampaignStatus
  campaignId?: string
  campaignTitle?: string
  campaignOpenedAt?: string | null
  onExportOrders?: () => Promise<void>
  onSetCampaignStatus?: (status: CampaignStatus) => Promise<void>
  onSetOrderPaid?: (orderId: string, paid: boolean) => Promise<void>
  onSetOrderOrganizerNote?: (orderId: string, note: string) => Promise<void>
  onPreviewPickupNotification?: (audience: PickupNotificationAudience, message: string) => Promise<PickupNotificationResponse>
  onSendPickupNotification?: (audience: PickupNotificationAudience, message: string, previewToken: string) => Promise<PickupNotificationResponse>
}

function AdminOrdersPanel({
  summary,
  campaignStatus,
  campaignId,
  campaignTitle,
  campaignOpenedAt,
  onExportOrders,
  onSetCampaignStatus,
  onSetOrderPaid,
  onSetOrderOrganizerNote,
  onPreviewPickupNotification,
  onSendPickupNotification,
}: AdminOrdersPanelProps) {
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set())
  const busyKeysRef = useRef(new Set<string>())
  const [notice, setNotice] = useState('')
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending'>('all')
  const [paymentTarget, setPaymentTarget] = useState<OrganizerOrderRow | null>(null)
  const [paymentError, setPaymentError] = useState('')
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})

  const run = async (key: string, action: () => Promise<void>, onError?: (message: string) => void) => {
    if (busyKeysRef.current.has(key)) return false
    busyKeysRef.current.add(key)
    setBusyKeys(new Set(busyKeysRef.current))
    setNotice('')
    try {
      await action()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (onError) onError(message)
      else setNotice(message)
      return false
    } finally {
      busyKeysRef.current.delete(key)
      setBusyKeys(new Set(busyKeysRef.current))
    }
  }

  const updateOrganizerNote = (order: OrganizerOrderRow, note: string) => {
    if (!onSetOrderOrganizerNote) return
    return run(`order-${order.orderId}`, () => onSetOrderOrganizerNote(order.orderId, note))
  }

  const statusAction = campaignStatus ? campaignStatusAction(campaignStatus) : null
  const pendingOrders = summary.orderRows.filter((order) => !order.paid)
  const visibleOrders = orderFilter === 'pending' ? pendingOrders : summary.orderRows
  const exportVisible = Boolean(
    campaignTitle
    && campaignOpenedAt
    && (campaignStatus === 'closed' || campaignStatus === 'arrived'),
  )
  const hasExportRows = buildOrderExportRows(summary, campaignTitle ?? '').length > 0
  const exportOrders = () => {
    if (!campaignTitle || !campaignOpenedAt) return Promise.resolve()
    return onExportOrders
      ? onExportOrders()
      : downloadOrderExport({ summary, campaignTitle, openedAt: campaignOpenedAt })
  }

  return (
    <section className="admin-orders-panel" aria-labelledby="admin-orders-heading">
      <header className="admin-orders-heading">
        <div>
          <p>ORDER OVERVIEW</p>
          <h2 id="admin-orders-heading">訂單統計</h2>
        </div>
        <span className={summary.formed ? 'formed' : ''}>
          {summary.formed
            ? '已成團'
            : summary.thresholdKind === 'amount'
              ? `還差 ${currency(summary.remaining)} 成團`
              : `還差 ${summary.remaining} ${summary.quantityUnit}成團`}
        </span>
      </header>

      {campaignStatus && (
        <div className="admin-workflow-bar">
          <div>
            <span>活動狀態</span>
            <strong>{campaignStatusLabel(campaignStatus)}</strong>
          </div>
          {(onSetCampaignStatus && statusAction || exportVisible) && (
            <div className="admin-workflow-actions">
              {onSetCampaignStatus && statusAction && (
                <button
                  type="button"
                  className="workflow-action workflow-action-secondary"
                  disabled={busyKeys.has('campaign')}
                  onClick={() => run('campaign', () => onSetCampaignStatus(statusAction.next))}
                >
                  <span className="workflow-action-icon" aria-hidden="true">↻</span>
                  {statusAction.label}
                </button>
              )}
              {onSetCampaignStatus && campaignStatus === 'closed' && (
                <button
                  type="button"
                  className="workflow-action workflow-action-primary"
                  disabled={busyKeys.has('campaign')}
                  onClick={() => run('campaign', () => onSetCampaignStatus('arrived'))}
                >
                  <span className="workflow-action-icon" aria-hidden="true">✓</span>
                  標記到貨
                </button>
              )}
              {exportVisible && (
                <button
                  type="button"
                  className="workflow-action workflow-action-export"
                  aria-label="匯出成團明細"
                  disabled={!hasExportRows || busyKeys.has('export')}
                  title={!hasExportRows ? '目前沒有可匯出的訂單' : undefined}
                  onClick={() => run('export', exportOrders)}
                >
                  <span className="workflow-action-icon" aria-hidden="true">↓</span>
                  {busyKeys.has('export') ? '建立Excel中…' : '匯出成團明細'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="admin-order-metrics">
        <article><span>參加戶數</span><strong>{summary.householdCount} 戶</strong></article>
        <article><span>總訂購量</span><strong>{summary.quantity} {summary.quantityUnit}</strong></article>
        <article><span>預估總額</span><strong>{currency(summary.amount)}</strong></article>
        <article><span>成團門檻</span><strong>{summary.thresholdKind === 'amount' ? currency(summary.threshold) : `${summary.threshold} ${summary.quantityUnit}`}</strong></article>
      </div>

      {campaignStatus && (
        <div className="admin-fulfillment-metrics" aria-label="付款統計">
          <span>已付款 <strong>{summary.fulfillment.paid}</strong></span>
          <span>未付款 <strong>{summary.fulfillment.unpaid}</strong></span>
        </div>
      )}

      <div className="admin-progress" aria-label="團主成團進度">
        <div><strong>{summary.thresholdKind === 'amount'
          ? `${currency(summary.amount)} / ${currency(summary.threshold)}`
          : `${summary.quantity} ${summary.quantityUnit} / ${summary.threshold} ${summary.quantityUnit}`}</strong><span>{summary.progressPercent}%</span></div>
        <div className="admin-progress-track"><span style={{ width: `${summary.progressPercent}%` }} /></div>
      </div>

      {campaignStatus && campaignId && campaignTitle && onPreviewPickupNotification && onSendPickupNotification && (
        <PickupNotificationPanel
          campaignId={campaignId}
          campaignTitle={campaignTitle}
          campaignStatus={campaignStatus}
          onPreview={onPreviewPickupNotification}
          onSend={onSendPickupNotification}
        />
      )}

      <div className="admin-order-sections">
        <section aria-labelledby="item-summary-heading">
          <div className="admin-subheading">
            <h3 id="item-summary-heading">品項彙總</h3>
            <span>{summary.itemRows.length} 個品項</span>
          </div>
          <div className="admin-table-scroll">
            <table className="item-summary-table">
              <colgroup>
                <col />
                <col className="item-summary-quantity-column" />
                <col className="item-summary-amount-column" />
              </colgroup>
              <thead><tr><th>品項</th><th>數量</th><th>小計</th></tr></thead>
              <tbody>
                {summary.itemRows.map((item) => (
                  <tr key={item.code}>
                    <td>
                      <span className="admin-item-identity">
                        <strong className="admin-item-code">{item.label}</strong>
                        <span className="admin-item-name">{item.name}</span>
                      </span>
                    </td>
                    <td><strong>{item.quantity} {summary.quantityUnit}</strong></td>
                    <td>{currency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="resident-orders-heading">
          <div className="admin-subheading">
            <h3 id="resident-orders-heading">住戶明細</h3>
            <span>{summary.orderRows.length} 筆訂單</span>
          </div>
          {campaignStatus && (
            <nav className="admin-order-filter" aria-label="住戶訂單篩選">
              <button type="button" aria-pressed={orderFilter === 'all'} onClick={() => setOrderFilter('all')}>全部 {summary.orderRows.length}</button>
              <button type="button" aria-pressed={orderFilter === 'pending'} onClick={() => setOrderFilter('pending')}>待處理 {pendingOrders.length}</button>
            </nav>
          )}
          {notice && <p className="admin-workflow-error" role="alert">{notice}</p>}
          <div className="admin-table-scroll">
            <table className="resident-order-table">
              <thead>
                <tr>
                  <th>戶號</th><th>姓名</th><th>訂購內容</th><th>總數</th><th>金額</th>
                  {campaignStatus && <><th>付款</th><th>備註</th></>}
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const orderBusy = busyKeys.has(`order-${order.orderId}`)
                  return (
                    <tr key={order.orderId} aria-busy={orderBusy || undefined}>
                      <td data-label="戶號"><span className="admin-unit-period">{periodLabel(order.period)}</span>{order.unit}</td>
                      <td data-label="姓名"><strong>{order.name}</strong></td>
                      <td data-label="訂購內容">
                        <span>{order.itemSummary || '無正式品項'}</span>
                        {order.customItemSummary && <span className="admin-custom-item-summary">{order.customItemSummary}</span>}
                      </td>
                      <td data-label="總數"><strong>{order.quantity} {summary.quantityUnit}</strong></td>
                      <td data-label="金額">{currency(order.amount)}{order.customItemSummary && <small className="admin-custom-price-note">＋另計</small>}</td>
                      {campaignStatus && (
                        <>
                          <td data-label="付款">
                            <button
                              type="button"
                              className={order.paid ? 'status-button paid' : 'status-button'}
                              aria-label={orderBusy ? `更新 ${order.unit} 中` : `標記 ${order.unit} ${order.paid ? '未付款' : '已付款'}`}
                              disabled={!onSetOrderPaid || orderBusy}
                              onClick={() => {
                                setPaymentError('')
                                setPaymentTarget(order)
                              }}
                            >
                              {orderBusy ? '更新中…' : order.paid ? '已付款' : '未付款'}
                            </button>
                          </td>
                          <td data-label="備註">
                            <div className="order-note-control">
                              <input
                                type="text"
                                aria-label={`${order.unit} 備註`}
                                maxLength={500}
                                value={noteDrafts[order.orderId] ?? order.organizerNote}
                                disabled={!onSetOrderOrganizerNote || orderBusy}
                                placeholder="輸入備註"
                                onChange={(event) => setNoteDrafts((current) => ({ ...current, [order.orderId]: event.target.value }))}
                              />
                              <button
                                type="button"
                                aria-label={`儲存 ${order.unit} 備註`}
                                disabled={!onSetOrderOrganizerNote || orderBusy || (noteDrafts[order.orderId] ?? order.organizerNote) === order.organizerNote}
                                onClick={() => updateOrganizerNote(order, noteDrafts[order.orderId] ?? order.organizerNote)}
                              >
                                {orderBusy ? '儲存中…' : '儲存'}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {paymentTarget && (
        <ConfirmDialog
          title="確認付款狀態"
          confirmLabel={`確認標記${paymentTarget.paid ? '未付款' : '已付款'}`}
          destructive={paymentTarget.paid}
          busy={busyKeys.has(`order-${paymentTarget.orderId}`)}
          onCancel={() => {
            setPaymentError('')
            setPaymentTarget(null)
          }}
          onConfirm={() => {
            void (async () => {
              if (!onSetOrderPaid) return
              setPaymentError('')
              const success = await run(
                `order-${paymentTarget.orderId}`,
                () => onSetOrderPaid(paymentTarget.orderId, !paymentTarget.paid),
                setPaymentError,
              )
              if (success) setPaymentTarget(null)
            })()
          }}
        >
          <p>確定要將「{periodLabel(paymentTarget.period)} {paymentTarget.unit}・{paymentTarget.name}」標記為<strong>{paymentTarget.paid ? '未付款' : '已付款'}</strong>嗎？</p>
          {paymentError && <p className="admin-workflow-error" role="alert">{paymentError}</p>}
        </ConfirmDialog>
      )}
    </section>
  )
}

export default AdminOrdersPanel
