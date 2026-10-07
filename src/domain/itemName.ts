/**
 * Item names without spaces typed before or after them. Names were saved as typed, and a stray
 * space showed up in the Excel export and copied lists; published items cannot be edited, so
 * every place that reads them tidies the ends.
 */
export function trimItemNames<T extends { name: string }>(items: T[]): T[] {
  return items.map((item) => item.name === item.name.trim() ? item : { ...item, name: item.name.trim() })
}
