import { EmptyState } from './components/ui/AsyncState'
import { StatusBadge } from './components/ui/StatusBadge'
import { formatMoney } from './components/resident/residentFormat'
import { describeResidentSchedule } from './components/resident/residentSchedule'
import { CampaignThumbnail, ResidentTopbar, type ResidentLineIdentity } from './ResidentCampaignListApp'
import type { CampaignStatus } from './domain/orderWorkflow'
import type { QuantityUnit } from './domain/quantityUnit'
import { residentCampaignPath } from './routing'
import type { CampaignImage } from './services/demoCampaignStore'
import './components/resident/resident.css'

export type ResidentMyOrder = {
  slug: string
  title: string
  status: CampaignStatus
  openedAt: string
  images: CampaignImage[]
  quantityUnit: QuantityUnit
  arrivalLabel: string
  autoCloseAt: string | null
  thresholdKind: 'quantity' | 'amount'
  thresholdAutoClose: boolean
  closedAt: string | null
  /** Ordered formal items, priced as they were when ordered. */
  items: { name: string; quantity: number; unitPrice: number }[]
  /** Unpriced items the resident added; the organizer settles them separately. */
  customItems: { name: string; quantity: number }[]
}

type ResidentMyOrdersAppProps = {
  identity: ResidentLineIdentity
  orders: ResidentMyOrder[]
  onLogout?: () => void | Promise<void>
  now?: Date
}

// Same order as the campaign list: open campaigns first, newest opening first within each.
function byListOrder(left: ResidentMyOrder, right: ResidentMyOrder) {
  return Number(right.status === 'open') - Number(left.status === 'open') || Date.parse(right.openedAt) - Date.parse(left.openedAt)
}

function OrderCard({ order, now }: { order: ResidentMyOrder; now: Date }) {
  const open = order.status === 'open'
  const { closing, arrival } = describeResidentSchedule(order, now)
  const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const amount = order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  return (
    <article className="resident-my-order" aria-label={order.title}>
      <div className="resident-my-order-head">
        <CampaignThumbnail campaign={order} />
        <div className="resident-my-order-title">
          <div>
            <h2>{order.title}</h2>
            <StatusBadge tone={open ? 'success' : 'neutral'}>{open ? '開團中' : '已結單'}</StatusBadge>
          </div>
          <p>{[closing?.line, arrival.line].filter(Boolean).join('・')}</p>
        </div>
      </div>
      <ul className="resident-my-order-items" aria-label="訂購品項">
        {order.items.map((item) => (
          <li key={item.name}>
            <span>{item.name} × {item.quantity}</span>
            <span className="ui-num">{formatMoney(item.quantity * item.unitPrice)}</span>
          </li>
        ))}
        {order.customItems.map((item) => (
          <li key={`custom-${item.name}`} className="is-custom"><span>{item.name} +{item.quantity}・另計</span></li>
        ))}
      </ul>
      <div className="resident-my-order-foot">
        {quantity > 0 && <strong>{`合計 ${quantity} ${order.quantityUnit}・${formatMoney(amount)}`}</strong>}
        <a href={residentCampaignPath(order.slug)}>{open ? '修改訂單' : '查看'}<span aria-hidden="true"> ›</span></a>
      </div>
    </article>
  )
}

export default function ResidentMyOrdersApp({ identity, orders, onLogout, now = new Date() }: ResidentMyOrdersAppProps) {
  return (
    <div className="resident-page has-tabbar">
      <ResidentTopbar identity={identity} onLogout={onLogout} current="orders" />
      <main className="resident-list resident-my-orders">
        <h1>我的訂單</h1>
        {orders.length === 0
          ? <EmptyState
              title="還沒有訂單"
              description="在團購頁下單後會出現在這裡。"
              action={<a className="ui-button" data-variant="secondary" href="/">看看團購</a>}
            />
          : [...orders].sort(byListOrder).map((order) => <OrderCard key={order.slug} order={order} now={now} />)}
      </main>
    </div>
  )
}
