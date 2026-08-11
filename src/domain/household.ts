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
