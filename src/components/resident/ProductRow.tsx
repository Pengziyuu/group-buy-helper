import { QuantityControl } from '../ui/QuantityControl'

type ProductRowProps = {
  code: string
  name: string
  priceText: string
  listPrice?: number
  hint?: string
  quantity: number
  disabled: boolean
  onDecrement: () => void
  onIncrement: () => void
}

export function ProductRow({ code, name, priceText, listPrice, hint, quantity, disabled, onDecrement, onIncrement }: ProductRowProps) {
  return (
    <div className="resident-product-row">
      <span className="resident-product-code">{code}</span>
      <div className="resident-product-name">
        <strong>{name}</strong>
        {listPrice !== undefined && <small className="resident-product-list-price">原價 ${listPrice}</small>}
        <span className="resident-product-price">{priceText}</span>
        {hint && <small>{hint}</small>}
      </div>
      <QuantityControl
        label={`${code} ${name}`}
        value={quantity}
        disabled={disabled}
        onDecrement={onDecrement}
        onIncrement={onIncrement}
      />
    </div>
  )
}
