import { Minus, Plus, Trash2 } from 'lucide-react'
import { Icon } from './Icon'

type QuantityControlProps = {
  label: string
  value: number
  min?: number
  max?: number
  disabled?: boolean
  onDecrement: () => void
  onIncrement: () => void
  /** When given, the minus turns into a remove button once the quantity is down to 1, as in a shopping cart. */
  onRemove?: () => void
}

export function QuantityControl({ label, value, min = 0, max = Number.POSITIVE_INFINITY, disabled = false, onDecrement, onIncrement, onRemove }: QuantityControlProps) {
  const removes = onRemove !== undefined && value <= 1
  return (
    <div className="ui-quantity-control">
      {removes ? (
        <button type="button" aria-label={`移除 ${label}`} data-variant="remove" disabled={disabled} onClick={onRemove}>
          <Icon icon={Trash2} size={18} />
        </button>
      ) : (
        <button type="button" aria-label={`減少 ${label}`} disabled={disabled || value <= min} onClick={onDecrement}><Icon icon={Minus} size={18} /></button>
      )}
      <output aria-label={`${label}數量`}>{value}</output>
      <button type="button" aria-label={`增加 ${label}`} disabled={disabled || value >= max} onClick={onIncrement}><Icon icon={Plus} size={18} /></button>
    </div>
  )
}
