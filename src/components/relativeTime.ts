import { createElement, useEffect, useState } from 'react'
import { formatZhTwTimestamp } from '../domain/timestamp'

const parse = (value: string | undefined | null) => {
  const time = Date.parse(value ?? '')
  return Number.isNaN(time) ? null : time
}

// A device clock running ahead of the server must not produce "-1 分鐘前", so anything not yet a minute old is "剛剛".
export function formatRelativeTime(value: string | undefined | null, now: Date): string {
  const time = parse(value)
  if (time === null || !value) return ''
  const minutes = Math.floor((now.getTime() - time) / 60_000)
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  return formatZhTwTimestamp(value).slice(5)
}

export function useNow(fixed?: Date, intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (fixed) return
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [fixed, intervalMs])
  return fixed ?? now
}

type RelativeTimeProps = { value: string | undefined | null; now: Date; prefix?: string; className?: string }

export function RelativeTime({ value, now, prefix = '', className }: RelativeTimeProps) {
  const text = formatRelativeTime(value, now)
  if (!text || !value) return null
  return createElement('time', { dateTime: value, title: formatZhTwTimestamp(value), className }, `${prefix}${text}`)
}
