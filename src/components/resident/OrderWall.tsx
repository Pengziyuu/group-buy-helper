import { useState } from 'react'
import type { VisibleOrder } from '../../data/demo'
import { wasMeaningfullyUpdated } from '../../domain/timestamp'
import { RelativeTime, useNow } from '../relativeTime'
import { Button } from '../ui/Button'

const WALL_PREVIEW_COUNT = 20

type OrderWallProps = {
  orders: VisibleOrder[]
  currentCustomerId?: string
  quantityUnit: string
  itemDisplayLabel: (code: string) => string
  now?: Date
}

const orderQuantity = (items: Record<string, number>) => Object.values(items).reduce((sum, quantity) => sum + quantity, 0)

export function OrderWall({ orders, currentCustomerId, quantityUnit, itemDisplayLabel, now }: OrderWallProps) {
  const [showAll, setShowAll] = useState(false)
  const currentTime = useNow(now)
  const sorted = [...orders].sort((left, right) => Date.parse(left.orderedAt) - Date.parse(right.orderedAt)
    || left.customerId.localeCompare(right.customerId))
  const visible = showAll ? sorted : sorted.slice(0, WALL_PREVIEW_COUNT)

  return (
    <section className="resident-card resident-wall" aria-labelledby="wall-heading">
      <div className="resident-section-heading">
        <h2 id="wall-heading">大家的訂單</h2>
        <span>{orders.length} 筆・即時更新</span>
      </div>
      {orders.length === 0 ? <p className="resident-empty">還沒有人下單。</p> : (
        <ul className="resident-wall-list">
          {visible.map((order) => {
            const own = order.customerId === currentCustomerId
            const customItems = order.customItems ?? []
            const customQuantity = customItems.reduce((sum, item) => sum + item.quantity, 0)
            return (
              <li key={order.customerId} className={own ? 'is-own' : undefined}>
                {order.pictureUrl
                  ? <img className="resident-avatar" src={order.pictureUrl} alt={`${order.name}的LINE頭貼`} referrerPolicy="no-referrer" />
                  : <span className="resident-avatar" aria-hidden="true">{order.name.slice(0, 1).toUpperCase()}</span>}
                <div className="resident-wall-main">
                  <p className="resident-wall-name"><strong>{order.name}</strong>{own && <span>（你）</span>}</p>
                  <p>{Object.entries(order.items)
                    .filter(([, quantity]) => quantity > 0)
                    .map(([code, quantity]) => `${itemDisplayLabel(code)}+${quantity}`)
                    .join('、') || '無正式品項'}</p>
                  {customItems.length > 0 && (
                    <p className="resident-wall-custom">{customItems.map((item) => `${item.name}×${item.quantity}（另計）`).join('、')}</p>
                  )}
                  <p className="resident-wall-time">
                    <RelativeTime value={order.orderedAt} now={currentTime} prefix="下單 " />
                    {wasMeaningfullyUpdated(order.orderedAt, order.updatedAt) && (
                      <span>已修改・<RelativeTime value={order.updatedAt} now={currentTime} /></span>
                    )}
                  </p>
                </div>
                <div className="resident-wall-total">
                  <strong>{orderQuantity(order.items)}{quantityUnit}</strong>
                  {customQuantity > 0 && <small>另有 {customQuantity} {quantityUnit}額外品項</small>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {!showAll && orders.length > WALL_PREVIEW_COUNT && (
        <Button variant="utility" onClick={() => setShowAll(true)}>顯示全部 {orders.length} 筆</Button>
      )}
    </section>
  )
}
