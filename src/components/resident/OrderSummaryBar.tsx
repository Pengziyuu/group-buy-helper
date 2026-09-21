import { Button } from '../ui/Button'
import { StickyActionBar } from '../ui/StickyActionBar'

type OrderSummaryBarProps = {
  quantity: number
  quantityUnit: string
  amount: number
  customQuantity: number
  onShowBreakdown?: () => void
  submitDisabled: boolean
  submitting: boolean
  onSubmit: () => void
  hint?: string | null
}

export function OrderSummaryBar({ quantity, quantityUnit, amount, customQuantity, onShowBreakdown, submitDisabled, submitting, onSubmit, hint }: OrderSummaryBarProps) {
  return (
    <StickyActionBar className="resident-order-bar" ariaLabel="訂單摘要與送出">
      <div className="resident-order-bar-row">
        <div className="resident-order-bar-total">
          <span className="resident-order-bar-label">本次訂單</span>
          <span className="resident-order-bar-quantity">{quantity} {quantityUnit}</span>
          <strong>${amount}</strong>
        </div>
        {onShowBreakdown && (
          <Button variant="utility" size="sm" aria-label="查看訂單明細" onClick={onShowBreakdown}>明細</Button>
        )}
        <Button className="resident-submit" onClick={onSubmit} disabled={submitDisabled} loading={submitting} loadingLabel="訂單送出中…">送出訂單</Button>
      </div>
      {customQuantity > 0 && <p className="resident-order-bar-note">另有 {customQuantity} {quantityUnit}額外品項・金額另計</p>}
      {hint && <p className="resident-order-bar-hint">{hint}</p>}
    </StickyActionBar>
  )
}
