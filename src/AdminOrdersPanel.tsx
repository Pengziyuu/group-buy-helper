import { useState } from 'react'
import type { OrganizerOrderSummary, OrganizerOrderRow } from './domain/adminOrders'
import {
  campaignStatusAction,
  campaignStatusLabel,
  type CampaignStatus,
  type PickupStatus,
} from './domain/orderWorkflow'
import './AdminOrdersPanel.css'

const currency = (amount: number) => `$${amount.toLocaleString('en-US')}`
const periodLabel = (period: number) => `${period === 1 ? '一期' : period === 2 ? '二期' : `${period}期`}`

export type FulfillmentUpdate = {
  paid: boolean
  pickupStatus: PickupStatus
}

type AdminOrdersPanelProps = {
  summary: OrganizerOrderSummary
  campaignStatus?: CampaignStatus
  onSetCampaignStatus?: (status: CampaignStatus) => Promise<void>
  onSetOrderFulfillment?: (orderId: string, update: FulfillmentUpdate) => Promise<void>
}

function AdminOrdersPanel({
  summary,
  campaignStatus,
  onSetCampaignStatus,
  onSetOrderFulfillment,
}: AdminOrdersPanelProps) {
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    setNotice('')
    try {
      await action()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy('')
    }
  }

  const updateOrder = (order: OrganizerOrderRow, update: Partial<FulfillmentUpdate>) => {
    if (!onSetOrderFulfillment) return
    const next = {
      paid: order.paid,
      pickupStatus: order.pickupStatus,
      ...update,
    }
    return run(`order-${order.orderId}`, () => onSetOrderFulfillment(order.orderId, next))
  }

  const statusAction = campaignStatus ? campaignStatusAction(campaignStatus) : null

  return (
    <section className="admin-orders-panel" aria-labelledby="admin-orders-heading">
      <header className="admin-orders-heading">
        <div>
          <p>ORDER OVERVIEW</p>
          <h2 id="admin-orders-heading">訂單統計</h2>
        </div>
        <span className={summary.formed ? 'formed' : ''}>
          {summary.formed ? '已成團' : `還差 ${summary.remaining} 個成團`}
        </span>
      </header>

      {campaignStatus && (
        <div className="admin-workflow-bar">
          <div>
            <span>活動狀態</span>
            <strong>{campaignStatusLabel(campaignStatus)}</strong>
          </div>
          {onSetCampaignStatus && statusAction && (
            <div className="admin-workflow-actions">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => run('campaign', () => onSetCampaignStatus(statusAction.next))}
              >
                {statusAction.label}
              </button>
              {campaignStatus === 'closed' && (
                <button
                  type="button"
                  className="secondary-action"
                  disabled={Boolean(busy)}
                  onClick={() => run('campaign', () => onSetCampaignStatus('arrived'))}
                >
                  標記到貨
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="admin-order-metrics">
        <article><span>參加戶數</span><strong>{summary.householdCount} 戶</strong></article>
        <article><span>總訂購量</span><strong>{summary.quantity} 個</strong></article>
        <article><span>預估總額</span><strong>{currency(summary.amount)}</strong></article>
        <article><span>成團門檻</span><strong>{summary.threshold} 個</strong></article>
      </div>

      {campaignStatus && (
        <div className="admin-fulfillment-metrics" aria-label="付款與領取統計">
          <span>已付款 <strong>{summary.fulfillment.paid}</strong></span>
          <span>未付款 <strong>{summary.fulfillment.unpaid}</strong></span>
          <span>可領取 <strong>{summary.fulfillment.ready}</strong></span>
          <span>已領取 <strong>{summary.fulfillment.pickedUp}</strong></span>
        </div>
      )}

      <div className="admin-progress" aria-label="團主成團進度">
        <div><strong>{summary.quantity} / {summary.threshold}</strong><span>{summary.progressPercent}%</span></div>
        <div className="admin-progress-track"><span style={{ width: `${summary.progressPercent}%` }} /></div>
      </div>

      <div className="admin-order-sections">
        <section aria-labelledby="item-summary-heading">
          <div className="admin-subheading">
            <h3 id="item-summary-heading">品項彙總</h3>
            <span>{summary.itemRows.length} 個品項</span>
          </div>
          <div className="admin-table-scroll">
            <table>
              <thead><tr><th>代號</th><th>品項</th><th>數量</th><th>小計</th></tr></thead>
              <tbody>
                {summary.itemRows.map((item) => (
                  <tr key={item.code}>
                    <td><strong className="admin-item-code">{item.code}</strong></td>
                    <td>{item.name}</td>
                    <td><strong>{item.quantity} 個</strong></td>
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
          {notice && <p className="admin-workflow-error" role="alert">{notice}</p>}
          <div className="admin-table-scroll">
            <table className="resident-order-table">
              <thead>
                <tr>
                  <th>戶號</th><th>姓名</th><th>訂購內容</th><th>總數</th><th>金額</th>
                  {campaignStatus && <><th>付款</th><th>領取</th></>}
                </tr>
              </thead>
              <tbody>
                {summary.orderRows.map((order) => (
                  <tr key={order.orderId}>
                    <td><span className="admin-unit-period">{periodLabel(order.period)}</span>{order.unit}</td>
                    <td><strong>{order.name}</strong></td>
                    <td>{order.itemSummary}</td>
                    <td><strong>{order.quantity} 個</strong></td>
                    <td>{currency(order.amount)}</td>
                    {campaignStatus && (
                      <>
                        <td>
                          <button
                            type="button"
                            className={order.paid ? 'status-button paid' : 'status-button'}
                            aria-label={`標記 ${order.unit} ${order.paid ? '未付款' : '已付款'}`}
                            disabled={!onSetOrderFulfillment || Boolean(busy)}
                            onClick={() => updateOrder(order, {
                              paid: !order.paid,
                            })}
                          >
                            {order.paid ? '已付款' : '未付款'}
                          </button>
                        </td>
                        <td>
                          <select
                            aria-label={`${order.unit} 領取狀態`}
                            value={order.pickupStatus}
                            disabled={!onSetOrderFulfillment || Boolean(busy)}
                            onChange={(event) => updateOrder(order, { pickupStatus: event.target.value as PickupStatus })}
                          >
                            <option value="pending">待到貨</option>
                            <option value="ready">可領取</option>
                            <option value="picked_up">已領取</option>
                          </select>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  )
}

export default AdminOrdersPanel
