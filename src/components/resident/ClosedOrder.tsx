import type { CustomOrderItem } from '../../domain/customOrderItem'
import { itemLabel } from '../../domain/itemLabel'
import type { CampaignItem } from '../../services/demoCampaignStore'

type ClosedOrderProps = {
  items: CampaignItem[]
  quantities: Record<string, number>
  customItems: CustomOrderItem[]
  quantityUnit: string
}

/** What the resident ordered once a campaign has closed, in the campaign's item order; nothing to edit. */
export function ClosedOrder({ items, quantities, customItems, quantityUnit }: ClosedOrderProps) {
  const ordered = items
    .map((item, index) => ({ item, label: itemLabel(index), quantity: quantities[item.code] ?? 0 }))
    .filter(({ quantity }) => quantity > 0)
  const hasOrder = ordered.length > 0 || customItems.length > 0

  return (
    <div className="resident-closed-order">
      {hasOrder && (
        <ul className="resident-closed-order-list" aria-label="你訂的品項">
          {ordered.map(({ item, label, quantity }) => (
            <li key={item.code}>
              <span><span className="resident-closed-order-code">{label}</span> {item.name}</span>
              <strong>{quantity} {quantityUnit}</strong>
            </li>
          ))}
          {customItems.map((item) => (
            <li key={item.id}>
              <span>{item.name}・另計</span>
              <strong>{item.quantity} {quantityUnit}</strong>
            </li>
          ))}
        </ul>
      )}
      <p className="resident-order-rule">{hasOrder ? '本團已結單，無法修改訂單。' : '本團已結單，你沒有在這團下單。'}</p>
    </div>
  )
}
