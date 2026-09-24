import { useEffect, useRef, useState } from 'react'
import { itemLabel, MAX_CAMPAIGN_ITEMS } from '../../../domain/itemLabel'
import type { CampaignItem } from '../../../services/demoCampaignStore'
import { Button } from '../../ui/Button'
import { appendItem, applyPriceToAll, nextItemCode } from './contentChecks'

const PRICE_PATTERN = /^\d+(?:\.\d{0,2})?$/
const MAX_PRICE = 9999999.99

type ItemTableProps = {
  items: CampaignItem[]
  locked: boolean
  disabled: boolean
  mixMatchEnabled: boolean
  onChange: (items: CampaignItem[]) => void
}

export function ItemTable({ items, locked, disabled, mixMatchEnabled, onChange }: ItemTableProps) {
  const [bulkPrice, setBulkPrice] = useState('')
  const nameInputs = useRef<Array<HTMLInputElement | null>>([])
  const focusRowRef = useRef<number | null>(null)
  const editable = !locked && !disabled
  const canAdd = editable && items.length < MAX_CAMPAIGN_ITEMS
  const bulkPriceValid = PRICE_PATTERN.test(bulkPrice) && Number(bulkPrice) <= MAX_PRICE

  // A new row's name field only exists after the parent re-renders with the longer list.
  useEffect(() => {
    if (focusRowRef.current === null) return
    nameInputs.current[focusRowRef.current]?.focus()
    focusRowRef.current = null
  }, [items.length])

  const update = (code: string, patch: Partial<CampaignItem>) => {
    onChange(items.map((item) => item.code === code ? { ...item, ...patch } : item))
  }

  const addItem = () => {
    if (!canAdd) return
    focusRowRef.current = items.length
    onChange(appendItem(items, nextItemCode(items)))
  }

  return (
    <div className="content-items">
      {!locked && (
        <div className="content-item-tools">
          <label className="content-bulk-price">
            <span>統一單價</span>
            <input
              className="ui-input"
              type="number"
              min="0"
              max={MAX_PRICE}
              step="0.01"
              inputMode="decimal"
              value={bulkPrice}
              disabled={disabled}
              onChange={(event) => {
                const value = event.target.value
                if (value === '' || PRICE_PATTERN.test(value)) setBulkPrice(value)
              }}
            />
          </label>
          <Button
            variant="utility"
            size="sm"
            disabled={disabled || !bulkPriceValid}
            onClick={() => onChange(applyPriceToAll(items, Number(bulkPrice)))}
          >
            全部套用
          </Button>
        </div>
      )}
      <div className="organizer-table-wrap">
        <table className="organizer-table content-item-table" aria-label="品項列表">
          <thead>
            <tr>
              <th scope="col">代碼</th>
              <th scope="col">商品名稱（口味）</th>
              <th scope="col">單價</th>
              {mixMatchEnabled && <th scope="col">參加任選</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const label = itemLabel(index)
              const last = index === items.length - 1
              return (
                <tr key={item.code} className={item.active ? undefined : 'is-inactive'}>
                  <th scope="row" className="content-item-code">{label}</th>
                  <td data-label="商品名稱（口味）">
                    <input
                      ref={(element) => { nameInputs.current[index] = element }}
                      className="ui-input"
                      aria-label={`品項 ${label} 商品名稱（口味）`}
                      maxLength={200}
                      placeholder="商品名稱"
                      value={item.name}
                      disabled={!editable}
                      onChange={(event) => update(item.code, { name: event.target.value })}
                    />
                  </td>
                  <td data-label="單價">
                    <input
                      className="ui-input content-item-price"
                      aria-label={`品項 ${label} 單價`}
                      type="number"
                      min="0"
                      max={MAX_PRICE}
                      step="0.01"
                      inputMode="decimal"
                      value={item.unitPrice ?? ''}
                      disabled={!editable}
                      onChange={(event) => {
                        const value = event.target.value
                        if (value !== '' && !PRICE_PATTERN.test(value)) return
                        update(item.code, { unitPrice: value === '' ? undefined : Number(value) })
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
                        event.preventDefault()
                        if (last) addItem()
                      }}
                    />
                  </td>
                  {mixMatchEnabled && (
                    <td data-label="參加任選">
                      <label className="content-item-mix-hit">
                        <input
                          type="checkbox"
                          className="content-item-mix"
                          aria-label={`品項 ${label} 加入任選優惠`}
                          checked={item.discountEligible ?? false}
                          disabled={!editable || !item.active}
                          onChange={(event) => update(item.code, { discountEligible: event.target.checked })}
                        />
                      </label>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!locked && (
        <div className="content-item-actions">
          <Button variant="secondary" size="sm" disabled={!canAdd} onClick={addItem}>
            <span aria-hidden="true">＋</span>增加品項
          </Button>
          <Button
            variant="utility"
            size="sm"
            disabled={!editable || items.length <= 1}
            onClick={() => onChange(items.slice(0, -1))}
          >
            <span aria-hidden="true">−</span>減少品項
          </Button>
          <small>在最後一列的單價按 Enter 也能新增品項；只能刪除最後一個品項。</small>
        </div>
      )}
    </div>
  )
}
