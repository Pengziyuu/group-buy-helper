import { nameInitial } from '../ui/nameInitial'
import { useState } from 'react'
import { Button } from '../ui/Button'
import { FeedbackMessage } from '../ui/FeedbackMessage'
import {
  formatHouseholdUnit,
  HOUSEHOLD_LETTERS,
  HOUSEHOLD_NUMBERS,
  HOUSEHOLD_PREFIXES,
  RESIDENT_PERIODS,
  type HouseholdKind,
  type ResidentPeriod,
} from '../../domain/household'

export type ResidentBindingInput = { kind: HouseholdKind; period: number | null; unit: string | null }

export type VerifiedResidentIdentity = {
  displayName: string
  pictureUrl: string | null
}

const safeResidentBindingMessages = new Set([
  '這個戶號已被綁定',
  '此期別與戶號已由其他住戶綁定',
  '住戶資料已綁定，如需變更請聯絡團主',
  '住戶期別或戶號不符合社區編碼',
  '請先完成 LINE 住戶驗證',
])

function residentBindingErrorMessage(error: unknown): string {
  const errorRecord = error && typeof error === 'object' ? error as Record<string, unknown> : null
  const message = error instanceof Error
    ? error.message
    : typeof errorRecord?.message === 'string' ? errorRecord.message : ''
  const code = typeof errorRecord?.code === 'string' ? errorRecord.code : ''
  const status = typeof errorRecord?.status === 'number' ? errorRecord.status : null

  if (safeResidentBindingMessages.has(message)) return message
  if (status === 401 || code === 'PGRST301' || /jwt|authentication required/i.test(message)) {
    return '登入狀態已失效，請重新開啟 LINE 頁面後再試。'
  }
  if (error instanceof TypeError || status === 0 || /failed to fetch|network|timeout/i.test(message)) {
    return '連線失敗，請確認網路後再試。'
  }
  return '住戶資料儲存失敗，請稍後再試。'
}

const periodFormatter = new Intl.NumberFormat('zh-Hant-u-nu-hanidec')

type ResidentBindingFormProps = {
  identity?: VerifiedResidentIdentity
  disabled: boolean
  onBind: (input: ResidentBindingInput) => Promise<void>
}

// Nothing is picked at first: a preset household was easy to save without looking, binding someone to the wrong door.
const PLACEHOLDER = <option value="" disabled>請選擇</option>

export function ResidentBindingForm({ identity, disabled, onBind }: ResidentBindingFormProps) {
  const [householdKind, setHouseholdKind] = useState<HouseholdKind | null>(null)
  const [period, setPeriod] = useState<ResidentPeriod | null>(null)
  const [prefix, setPrefix] = useState<number | null>(null)
  const [letter, setLetter] = useState('')
  const [floor, setFloor] = useState<number | null>(null)
  const [binding, setBinding] = useState(false)
  const [error, setError] = useState('')
  // What would be saved, or null until every part the chosen phase needs has been picked.
  const selection: ResidentBindingInput | null = householdKind === 'other'
    ? { kind: 'other', period: null, unit: null }
    : householdKind === 'resident' && period !== null && (period === 1 || prefix !== null) && letter !== '' && floor !== null
      ? { kind: 'resident', period, unit: formatHouseholdUnit({ kind: 'resident', period, prefix: period === 1 ? null : prefix, letter, number: floor }) }
      : null

  const submit = async () => {
    if (!selection) return
    setBinding(true)
    setError('')
    try {
      await onBind(selection)
    } catch (failure) {
      setError(residentBindingErrorMessage(failure))
    } finally {
      setBinding(false)
    }
  }

  return (
    <div className="resident-binding">
      <h3>首次填寫住戶資料</h3>
      <p className="resident-binding-intro">完成一次綁定後，即可選擇品項並送出訂單。</p>
      {identity && (
        <div className="resident-verified-identity">
          {identity.pictureUrl
            ? <img className="resident-avatar" src={identity.pictureUrl} alt={`${identity.displayName}的 LINE 頭貼`} referrerPolicy="no-referrer" />
            : <span className="resident-avatar" aria-hidden="true">{nameInitial(identity.displayName)}</span>}
          <div><small>LINE 驗證身分</small><strong>{identity.displayName}</strong></div>
        </div>
      )}
      <div className="resident-binding-fields">
        <label>
          <span>期別</span>
          <select
            className="ui-input"
            value={householdKind === 'other' ? 'other' : period ?? ''}
            onChange={(event) => {
              if (event.target.value === 'other') {
                setHouseholdKind('other')
              } else {
                setHouseholdKind('resident')
                setPeriod(Number(event.target.value) as ResidentPeriod)
              }
            }}
          >
            {PLACEHOLDER}
            {RESIDENT_PERIODS.map((value) => <option key={value} value={value}>{periodFormatter.format(value)}期</option>)}
            <option value="other">其他</option>
          </select>
        </label>
        {householdKind === 'resident' && (
          <fieldset className="resident-binding-unit">
            <legend>戶號</legend>
            <div className="resident-binding-unit-parts">
              {period !== 1 && (
                <label>
                  <span>數字</span>
                  <select className="ui-input" aria-label="戶號數字" value={prefix ?? ''} onChange={(event) => setPrefix(Number(event.target.value))}>
                    {PLACEHOLDER}
                    {HOUSEHOLD_PREFIXES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              )}
              <label>
                <span>英文字母</span>
                <select className="ui-input" aria-label="戶號英文字母" value={letter} onChange={(event) => setLetter(event.target.value)}>
                  {PLACEHOLDER}
                  {HOUSEHOLD_LETTERS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              {/* The floor is part of the household number (2A15), so it sits with the other parts. */}
              <label>
                <span>樓層</span>
                <select className="ui-input" value={floor ?? ''} onChange={(event) => setFloor(Number(event.target.value))}>
                  {PLACEHOLDER}
                  {HOUSEHOLD_NUMBERS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
          </fieldset>
        )}
      </div>
      <Button onClick={() => { void submit() }} disabled={disabled || !selection} loading={binding} loadingLabel="住戶資料儲存中…">儲存住戶資料</Button>
      {error && <FeedbackMessage className="resident-binding-feedback" tone="error">{error}</FeedbackMessage>}
      <p className="resident-binding-note">住戶資料只用於辨識訂單；同一戶號可由多個 LINE 帳號各自下單。</p>
    </div>
  )
}
