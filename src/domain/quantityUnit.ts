export const QUANTITY_UNITS = ['個', '盒', '包', '袋', '瓶', '罐', '組', '份', '條', '顆', '箱'] as const

export type QuantityUnit = (typeof QUANTITY_UNITS)[number]

export const DEFAULT_QUANTITY_UNIT: QuantityUnit = '個'

export function isQuantityUnit(value: unknown): value is QuantityUnit {
  return typeof value === 'string' && (QUANTITY_UNITS as readonly string[]).includes(value)
}

export function normalizeQuantityUnit(value: unknown): QuantityUnit {
  return isQuantityUnit(value) ? value : DEFAULT_QUANTITY_UNIT
}
