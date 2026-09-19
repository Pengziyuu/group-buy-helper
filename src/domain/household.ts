const CHINESE_NUMBERS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

export const RESIDENT_PERIODS = [1, 2, 3] as const
export const HOUSEHOLD_PREFIXES = [1, 2, 3] as const
export const HOUSEHOLD_LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))
export const HOUSEHOLD_NUMBERS = Array.from({ length: 15 }, (_, index) => index + 1)

export type ResidentPeriod = (typeof RESIDENT_PERIODS)[number]

export function formatResidentPeriod(period: number): string {
  if (!RESIDENT_PERIODS.includes(period as ResidentPeriod)) throw new Error('期別只能選擇一期、二期或三期')
  return `${new Intl.NumberFormat('zh-Hant-u-nu-hanidec').format(period)}期`
}

export type HouseholdKind = 'resident' | 'other'

export function formatHousehold(kind: HouseholdKind, period: number | null, unit: string | null): string {
  if (kind === 'other') return '其他'
  if (period === null || unit === null) throw new Error('住戶必須有期別與戶號')
  return `${formatResidentPeriod(period)} ${unit}`
}

export type HouseholdSortKey = {
  householdKind: HouseholdKind
  period: number | null
  unit: string | null
  name: string
}

const householdUnitCollator = new Intl.Collator('zh-TW', { numeric: true, sensitivity: 'base' })
// Stroke-count order, which is what Taiwanese directories and registries use.
// Plain 'zh-TW' collates Han characters this way by default.
const householdNameCollator = new Intl.Collator('zh-TW')

// Residents sort before people outside the community, then by period, then by
// unit -- numerically, so 2A9 sorts before 2A10 as a human expects -- and
// finally by name, which is what separates two accounts sharing one household.
// Used wherever the on-screen order and the exported spreadsheet's order need
// to agree, since organizers cross-reference the two while handing out goods.
export function compareHousehold(left: HouseholdSortKey, right: HouseholdSortKey): number {
  if (left.householdKind !== right.householdKind) return left.householdKind === 'resident' ? -1 : 1
  if (left.householdKind === 'other') return householdNameCollator.compare(left.name, right.name)
  return (left.period ?? 0) - (right.period ?? 0)
    || householdUnitCollator.compare(left.unit ?? '', right.unit ?? '')
    || householdNameCollator.compare(left.name, right.name)
}

export type HouseholdSelection = {
  kind: HouseholdKind
  period: ResidentPeriod
  prefix: number | null
  letter: string
  number: number
}

function assertHouseholdSelection(selection: HouseholdSelection): void {
  if (selection.kind === 'other') return
  if (!RESIDENT_PERIODS.includes(selection.period)) throw new Error('期別只能選擇一期、二期或三期')
  if (selection.period === 1 && selection.prefix !== null) throw new Error('一期不需要前段')
  if (selection.period !== 1 && !HOUSEHOLD_PREFIXES.includes(selection.prefix as 1 | 2 | 3)) {
    throw new Error('前段只能選擇1至3')
  }
  if (!HOUSEHOLD_LETTERS.includes(selection.letter)) throw new Error('棟別只能選擇A至Z')
  if (!HOUSEHOLD_NUMBERS.includes(selection.number)) throw new Error('號碼只能選擇1至15')
}

export function formatHouseholdUnit(selection: HouseholdSelection): string | null {
  assertHouseholdSelection(selection)
  if (selection.kind === 'other') return null
  return `${selection.period === 1 ? '' : selection.prefix}${selection.letter}${selection.number}`
}

export function parseHouseholdUnit(period: number, unit: string): HouseholdSelection {
  if (!RESIDENT_PERIODS.includes(period as ResidentPeriod)) throw new Error('期別只能選擇一期、二期或三期')
  const normalized = unit.trim().toUpperCase()
  const match = period === 1
    ? /^([A-Z])([1-9]|1[0-5])$/.exec(normalized)
    : /^([1-3])([A-Z])([1-9]|1[0-5])$/.exec(normalized)
  if (!match) throw new Error(period === 1 ? '一期戶號格式錯誤' : '二、三期戶號格式錯誤')
  return period === 1
    ? { kind: 'resident', period: 1, prefix: null, letter: match[1], number: Number(match[2]) }
    : { kind: 'resident', period: period as 2 | 3, prefix: Number(match[1]), letter: match[2], number: Number(match[3]) }
}

export type HouseholdIdentity = {
  name: string
  period: number
  unit: string
  key: string
}

export function parseHouseholdLabel(label: string): HouseholdIdentity {
  let source = label.trim()
  let period = 2

  const periodMatch = source.match(/([一二三四五六七八九十]|\d+)\s*期/i)
  if (periodMatch) {
    period = /^\d+$/.test(periodMatch[1])
      ? Number(periodMatch[1])
      : CHINESE_NUMBERS[periodMatch[1]]
    source = source.replace(periodMatch[0], ' ')
  }

  const runs = source.match(/[A-Za-z0-9]+/g) ?? []
  const unit = runs.find((run) => /[A-Za-z]/.test(run) && /\d/.test(run))
  if (!unit) {
    throw new Error('找不到包含英文字母與數字的戶號')
  }

  const normalizedUnit = unit.toUpperCase()
  const name = source.replace(unit, ' ').replace(/\s+/g, ' ').trim()

  return {
    name,
    period,
    unit: normalizedUnit,
    key: `${period}:${normalizedUnit}`,
  }
}
