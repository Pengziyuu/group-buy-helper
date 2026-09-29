// Resident-facing money and time text: as short as the reader needs, never a weekday.
// The organizer desk keeps its own, more precise formats.
import { taipeiDateInputFromIso, taipeiTimeInputFromIso } from '../../domain/campaignSchedule'

const DAY = 24 * 60 * 60 * 1000

export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`
}

/** "10/4" within the current year, "2025/12/31" otherwise. */
export function formatShortDate(value: string, now: Date): string {
  const date = taipeiDateInputFromIso(value)
  if (!date) return ''
  const [year, month, day] = date.split('-')
  const thisYear = taipeiDateInputFromIso(now.toISOString()).slice(0, 4)
  return `${year === thisYear ? '' : `${year}/`}${Number(month)}/${Number(day)}`
}

/** Closing keeps the hour, since it decides whether an order still makes it. */
export function formatClosing(value: string | null | undefined, now: Date): { when: string; soon: boolean } | null {
  const date = taipeiDateInputFromIso(value)
  if (!value || !date) return null
  const time = taipeiTimeInputFromIso(value)
  if (date === taipeiDateInputFromIso(now.toISOString())) return { when: `今天 ${time}`, soon: true }
  if (date === taipeiDateInputFromIso(new Date(now.getTime() + DAY).toISOString())) return { when: `明天 ${time}`, soon: true }
  return { when: `${formatShortDate(value, now)} ${time}`, soon: false }
}

/** Past moments, chat-style: 剛剛, N 分鐘前, N 小時前, 昨天, then a short date. */
export function formatResidentRelative(value: string | null | undefined, now: Date): string {
  const time = Date.parse(value ?? '')
  if (!value || Number.isNaN(time)) return ''
  // A device clock behind the server must not produce "-1 分鐘前".
  const minutes = Math.floor((now.getTime() - time) / 60_000)
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小時前`
  if (taipeiDateInputFromIso(value) === taipeiDateInputFromIso(new Date(now.getTime() - DAY).toISOString())) return '昨天'
  return formatShortDate(value, now)
}
