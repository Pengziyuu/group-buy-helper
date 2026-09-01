export const MAX_CAMPAIGN_ITEMS = 100

export function itemLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('品項字母索引必須是非負整數')
  }

  let value = index + 1
  let label = ''
  while (value > 0) {
    value -= 1
    label = String.fromCharCode(65 + (value % 26)) + label
    value = Math.floor(value / 26)
  }
  return label
}
