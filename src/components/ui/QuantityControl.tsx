type QuantityControlProps = {
  label: string
  value: number
  min?: number
  max?: number
  disabled?: boolean
  onDecrement: () => void
  onIncrement: () => void
}

export function QuantityControl({ label, value, min = 0, max = 20, disabled = false, onDecrement, onIncrement }: QuantityControlProps) {
  return (
    <div className="ui-quantity-control">
      <button type="button" aria-label={`減少 ${label}`} disabled={disabled || value <= min} onClick={onDecrement}>−</button>
      <output aria-label={`${label}數量`}>{value}</output>
      <button type="button" aria-label={`增加 ${label}`} disabled={disabled || value >= max} onClick={onIncrement}>＋</button>
    </div>
  )
}
