import { useState } from 'react'
import type { VisibleOrder } from '../../data/demo'
import { wasMeaningfullyUpdated } from '../../domain/timestamp'
import { EditedMark, RelativeTime, useNow } from '../relativeTime'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'

const WALL_PREVIEW_COUNT = 20
const POPULAR_COUNT = 3

type OrderWallProps = {
  orders: VisibleOrder[]
  currentCustomerId?: string
  quantityUnit: string
  itemDisplayLabel: (code: string) => string
  /** The campaign's item codes in listing order; each order's items follow it rather than the order they were tapped. */
  itemCodes?: string[]
  /** Each item's name, for 熱門品項; without it the wall shows no ranking. */
  itemName?: (code: string) => string
  now?: Date
}

const orderQuantity = (items: Record<string, number>) => Object.values(items).reduce((sum, quantity) => sum + quantity, 0)

export function OrderWall({ orders, currentCustomerId, quantityUnit, itemDisplayLabel, itemCodes = [], itemName, now }: OrderWallProps) {
  const rank = (code: string) => {
    const index = itemCodes.indexOf(code)
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
  }
  const [showAll, setShowAll] = useState(false)
  const currentTime = useNow(now)
  // The resident's own order first, wherever it falls; then the newest, as the first view shows twenty.
  const sorted = [...orders].sort((left, right) => Number(right.customerId === currentCustomerId) - Number(left.customerId === currentCustomerId)
    || Date.parse(right.orderedAt) - Date.parse(left.orderedAt)
    || left.customerId.localeCompare(right.customerId))
  const visible = showAll ? sorted : sorted.slice(0, WALL_PREVIEW_COUNT)
  // What everyone is buying, to help choose: formal items only, as custom items are each resident's own words.
  const totals = new Map<string, number>()
  for (const order of orders) {
    for (const [code, quantity] of Object.entries(order.items)) {
      if (quantity > 0) totals.set(code, (totals.get(code) ?? 0) + quantity)
    }
  }
  const popular = itemName && itemCodes.length > 1
    ? [...totals].sort(([leftCode, left], [rightCode, right]) => right - left || rank(leftCode) - rank(rightCode) || leftCode.localeCompare(rightCode)).slice(0, POPULAR_COUNT)
    : []

  return (
    <section className="resident-card resident-wall" aria-labelledby="wall-heading">
      <div className="resident-section-heading">
        <h2 id="wall-heading">大家的訂單</h2>
        <span>{orders.length} 筆・即時更新</span>
      </div>
      {itemName && popular.length > 0 && (
        <div className="resident-wall-popular">
          <p aria-hidden="true">熱門品項</p>
          <ul aria-label="熱門品項">
            {popular.map(([code, quantity]) => <li key={code}>{`${itemDisplayLabel(code)} ${itemName(code)} ${quantity} ${quantityUnit}`}</li>)}
          </ul>
        </div>
      )}
      {orders.length === 0 ? <p className="resident-empty">還沒有人下單。</p> : (
        <ul className="resident-wall-list">
          {visible.map((order) => {
            const own = order.customerId === currentCustomerId
            const customItems = order.customItems ?? []
            const customQuantity = customItems.reduce((sum, item) => sum + item.quantity, 0)
            return (
              <li key={order.customerId} className={own ? 'is-own' : undefined}>
                <Avatar className="resident-avatar" name={order.name} pictureUrl={order.pictureUrl} />
                <div className="resident-wall-main">
                  <p className="resident-wall-name"><strong>{order.name}</strong>{own && <span>（你）</span>}</p>
                  <p>{Object.entries(order.items)
                    .filter(([, quantity]) => quantity > 0)
                    .sort(([left], [right]) => rank(left) - rank(right) || left.localeCompare(right))
                    .map(([code, quantity]) => `${itemDisplayLabel(code)}+${quantity}`)
                    .join('、') || '無正式品項'}</p>
                  {customItems.length > 0 && (
                    <p className="resident-wall-custom">{customItems.map((item) => `${item.name}+${item.quantity}・另計`).join('、')}</p>
                  )}
                  <p className="resident-wall-time">
                    <RelativeTime value={order.orderedAt} now={currentTime} />
                    {wasMeaningfullyUpdated(order.orderedAt, order.updatedAt) && <><span aria-hidden="true">·</span><EditedMark value={order.updatedAt} /></>}
                  </p>
                </div>
                <div className="resident-wall-total">
                  <strong>{orderQuantity(order.items) + customQuantity} {quantityUnit}</strong>
                  {customQuantity > 0 && <small>含 {customQuantity} {quantityUnit}額外品項</small>}
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
