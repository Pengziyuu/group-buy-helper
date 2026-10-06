// How a resident reads a campaign's schedule. Closing and arrival always come as a pair while
// a campaign is open, so every card carries the same line; once closed, the day it closed (when
// known) and arrival.
import { describeAutoClose, formatShortDate, normalizeArrivalLabel } from '../../domain/campaignSchedule'
import type { CampaignStatus } from '../../domain/orderWorkflow'

type ScheduleInput = {
  status: CampaignStatus
  autoCloseAt?: string | null
  /** When the campaign actually closed; unknown for campaigns closed before it was recorded. */
  closedAt?: string | null
  thresholdKind?: 'quantity' | 'amount'
  thresholdAutoClose?: boolean
  arrivalLabel?: string
}

/** `value` fills the campaign page's fact box; `line` is the list card's wording. */
export type ScheduleFact = { value: string; line: string }
export type ClosingFact = ScheduleFact & { soon: boolean; note?: string }

export function describeResidentSchedule(input: ScheduleInput, now: Date): { closing: ClosingFact | null; arrival: ScheduleFact } {
  const closing = input.status === 'open' ? describeClosing(input, now) : describeClosed(input.closedAt, now)
  return { closing, arrival: describeArrival(input) }
}

function describeClosed(closedAt: string | null | undefined, now: Date): ClosingFact | null {
  const day = closedAt ? formatShortDate(closedAt, now) : ''
  return day ? { value: day, line: `${day} 結單`, soon: false } : null
}

function describeClosing({ autoCloseAt, thresholdKind = 'quantity', thresholdAutoClose = thresholdKind === 'quantity' }: ScheduleInput, now: Date): ClosingFact {
  const scheduled = describeAutoClose(autoCloseAt, now)
  if (scheduled) {
    // Either threshold may close the campaign before its scheduled time.
    return {
      value: scheduled.when,
      line: `${scheduled.when} 結單`,
      soon: scheduled.soon,
      ...(thresholdAutoClose ? { note: thresholdKind === 'quantity' ? '額滿會提早結單' : '金額達標會提早結單' } : {}),
    }
  }
  if (thresholdAutoClose) return thresholdKind === 'quantity'
    ? { value: '額滿自動結單', line: '額滿結單', soon: false }
    : { value: '達標自動結單', line: '達標結單', soon: false }
  return { value: '手動決定結單', line: '手動決定結單', soon: false, note: '結單前群組通知' }
}

function describeArrival({ arrivalLabel }: ScheduleInput): ScheduleFact {
  const label = normalizeArrivalLabel(arrivalLabel)
  if (label === '貨到通知') return { value: label, line: label }
  const date = /^(\d{2})\/(\d{2})$/.exec(label)
  if (date) {
    const short = `${Number(date[1])}/${Number(date[2])}`
    return { value: short, line: `${short} 到貨` }
  }
  return { value: label, line: `${label}到貨` }
}
