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
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </svg>
        </button>
      ) : (
        <button type="button" aria-label={`減少 ${label}`} disabled={disabled || value <= min} onClick={onDecrement}>−</button>
      )}
      <output aria-label={`${label}數量`}>{value}</output>
      <button type="button" aria-label={`增加 ${label}`} disabled={disabled || value >= max} onClick={onIncrement}>＋</button>
    </div>
  )
}
