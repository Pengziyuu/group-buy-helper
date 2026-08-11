import type { OrganizerOrderSummary } from './domain/adminOrders'
import './AdminOrdersPanel.css'

const currency = (amount: number) => `$${amount.toLocaleString('en-US')}`
const periodLabel = (period: number) => `${period === 1 ? '一期' : period === 2 ? '二期' : `${period}期`}`

function AdminOrdersPanel({ summary }: { summary: OrganizerOrderSummary }) {
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

      <div className="admin-order-metrics">
        <article><span>參加戶數</span><strong>{summary.householdCount} 戶</strong></article>
        <article><span>總訂購量</span><strong>{summary.quantity} 個</strong></article>
        <article><span>預估總額</span><strong>{currency(summary.amount)}</strong></article>
        <article><span>成團門檻</span><strong>{summary.threshold} 個</strong></article>
      </div>

      <div className="admin-progress" aria-label="團主成團進度">
        <div><strong>{summary.quantity} / {summary.threshold}</strong><span>{summary.progressPercent}%</span></div>
        <div className="admin-progress-track"><span style={{ width: `${summary.progressPercent}%` }} /></div>
      </div>

      <div className="admin-order-sections">
        <section aria-labelledby="item-summary-heading">
          <div className="admin-subheading">
            <h3 id="item-summary-heading">品項彙總</h3>
            <span>A–I 口味</span>
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
          <div className="admin-table-scroll">
            <table className="resident-order-table">
              <thead><tr><th>戶號</th><th>姓名</th><th>訂購內容</th><th>總數</th><th>金額</th></tr></thead>
              <tbody>
                {summary.orderRows.map((order) => (
                  <tr key={order.customerId}>
                    <td><span className="admin-unit-period">{periodLabel(order.period)}</span>{order.unit}</td>
                    <td><strong>{order.name}</strong></td>
                    <td>{order.itemSummary}</td>
                    <td><strong>{order.quantity} 個</strong></td>
                    <td>{currency(order.amount)}</td>
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
