const zhTwTimestampFormatter = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function formatZhTwTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = Object.fromEntries(
    zhTwTimestampFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  )
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`
}

export function wasMeaningfullyUpdated(
  orderedAt: string,
  updatedAt: string,
): boolean {
  const orderedTime = new Date(orderedAt).getTime()
  const updatedTime = new Date(updatedAt).getTime()
  return Number.isFinite(orderedTime)
    && Number.isFinite(updatedTime)
    && updatedTime > orderedTime
}
