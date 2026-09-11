export type CustomOrderItem = {
  id: string
  name: string
  quantity: number
}

export const customOrderItemsEqual = (left: CustomOrderItem[], right: CustomOrderItem[]) =>
  left.length === right.length && left.every((item, index) => {
    const other = right[index]
    return item.id === other?.id && item.name === other.name && item.quantity === other.quantity
  })

export const validCustomOrderItems = (items: CustomOrderItem[]) => items
  .map((item) => ({ ...item, name: item.name.trim() }))
  .filter((item) => item.name.length > 0 && item.quantity > 0)

export function parseCustomOrderItems(value: unknown): CustomOrderItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const candidate = item as Partial<CustomOrderItem>
    if (typeof candidate.id !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(candidate.id)
      || typeof candidate.name !== 'string' || candidate.name.trim().length < 1 || candidate.name.trim().length > 100
      || !Number.isInteger(candidate.quantity) || (candidate.quantity ?? 0) < 1 || (candidate.quantity ?? 0) > 20) return []
    return [{ id: candidate.id, name: candidate.name.trim(), quantity: candidate.quantity as number }]
  })
}
