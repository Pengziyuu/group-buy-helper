export type ArrivalMode = 'notice' | 'date' | 'month-period'
export type ArrivalPeriod = '初' | '中' | '底'

export type ParsedArrivalLabel = {
  mode: ArrivalMode
  month: number
  day: number
  period: ArrivalPeriod
}

const pad = (value: number) => String(value).padStart(2, '0')

export function daysInMonth(month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 31
  return new Date(Date.UTC(2000, month, 0)).getUTCDate()
}

function validMonthDay(month: number, day: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12
    && Number.isInteger(day) && day >= 1 && day <= daysInMonth(month)
}

export function validArrivalLabel(value: unknown): value is string {
  if (value === '貨到通知') return true
  if (typeof value !== 'string') return false
  const date = /^(\d{2})\/(\d{2})$/.exec(value)
  if (date) return validMonthDay(Number(date[1]), Number(date[2]))
  const period = /^(\d{1,2})月(初|中|底)$/.exec(value)
  return Boolean(period && Number(period[1]) >= 1 && Number(period[1]) <= 12)
}

export function normalizeArrivalLabel(value: unknown): string {
  return validArrivalLabel(value) ? value : '貨到通知'
}

export function parseArrivalLabel(value: unknown): ParsedArrivalLabel {
  const normalized = normalizeArrivalLabel(value)
  const date = /^(\d{2})\/(\d{2})$/.exec(normalized)
  if (date) return { mode: 'date', month: Number(date[1]), day: Number(date[2]), period: '初' }
  const period = /^(\d{1,2})月(初|中|底)$/.exec(normalized)
  if (period) return { mode: 'month-period', month: Number(period[1]), day: 1, period: period[2] as ArrivalPeriod }
  return { mode: 'notice', month: 1, day: 1, period: '初' }
}

export function buildArrivalLabel(mode: ArrivalMode, month: number, day: number, period: ArrivalPeriod): string {
  if (mode === 'notice') return '貨到通知'
  if (mode === 'date') {
    if (!validMonthDay(month, day)) throw new Error('到貨日期格式錯誤')
    return `${pad(month)}/${pad(day)}`
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('到貨月份格式錯誤')
  return `${month}月${period}`
}

export function formatArrivalLabel(value: unknown): string {
  return `預計到貨：${normalizeArrivalLabel(value)}`
}

export function validDateInput(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 2000 || year > 9999 || !validMonthDay(month, day)) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function taipeiNoonIso(dateInput: string): string {
  if (!validDateInput(dateInput)) throw new Error('結單日期格式錯誤')
  return new Date(`${dateInput}T12:00:00+08:00`).toISOString()
}

export function taipeiDateInputFromIso(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function todayInTaipei(): string {
  return taipeiDateInputFromIso(new Date().toISOString())
}

export function formatAutoCloseReminder(value: string): string {
  const date = taipeiDateInputFromIso(value)
  if (!date) return ''
  const [, month, day] = date.split('-')
  return `${month}/${day} 12:00 自動結單`
}
