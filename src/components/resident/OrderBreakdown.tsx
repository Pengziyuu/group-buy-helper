import type { CustomOrderItem } from '../../domain/customOrderItem'
import type { PricedOrderLine } from '../../domain/discountPricing'

export type BreakdownLine = PricedOrderLine & {
  label: string
  name: string
  discountText: string
}

type OrderBreakdownProps = {
  lines: BreakdownLine[]
  customItems: CustomOrderItem[]
  total: number
  savings: number
  quantityUnit: string
}

export function OrderBreakdown({ lines, customItems, total, savings, quantityUnit }: OrderBreakdownProps) {
  const filledCustomItems = customItems.filter((item) => item.quantity > 0)
  const customQuantity = filledCustomItems.reduce((sum, item) => sum + item.quantity, 0)
  return (
    <div className="resident-breakdown">
      <ul className="resident-breakdown-lines">
        {lines.map((line) => (
          <li key={line.code}>
            <span className="resident-product-code">{line.label}</span>
            <div>
              <strong>{line.name}</strong>
              <small>
                <span className="resident-breakdown-discount">{line.discountText}</span>
                {line.listUnitPrice !== line.finalUnitPrice ? `・原價 $${line.listUnitPrice}` : ''}
              </small>
            </div>
            <span>{line.quantity} × ${line.finalUnitPrice}</span>
            <strong>${line.lineTotal}</strong>
          </li>
        ))}
        {filledCustomItems.map((item) => (
          <li key={item.id} className="is-custom">
            <span className="resident-product-code">＋</span>
            <div><strong>{item.name || '未命名額外品項'}</strong><small>額外品項</small></div>
            <span>{item.quantity} {quantityUnit}</span>
            <strong>金額另計</strong>
          </li>
        ))}
      </ul>
      <div className="resident-breakdown-total">
        <div>
          <span>商品合計</span>
          {savings > 0 && <small>已省 ${savings}</small>}
          {customQuantity > 0 && <small>另有 {customQuantity} {quantityUnit}額外品項，金額另計</small>}
        </div>
        <strong>${total}</strong>
      </div>
    </div>
  )
}
