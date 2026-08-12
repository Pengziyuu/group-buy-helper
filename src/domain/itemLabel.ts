export const MAX_ITEM_LETTERS = 26

export function itemLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_ITEM_LETTERS) {
    throw new RangeError('品項字母索引必須介於 0 到 25')
  }
  return `${String.fromCharCode(65 + index)}號`
}
