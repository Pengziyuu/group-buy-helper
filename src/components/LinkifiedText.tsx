import { Fragment } from 'react'
import './LinkifiedText.css'

const urlPattern = /https?:\/\/[^\s<，。！？；：、）】》]+/giu
const trailingPunctuationPattern = /[.,!?;:，。！？；：、）】》]+$/u

type LinkifiedTextProps = {
  text: string
}

export default function LinkifiedText({ text }: LinkifiedTextProps) {
  const parts = []
  let cursor = 0

  for (const match of text.matchAll(urlPattern)) {
    const start = match.index
    const matchedText = match[0]
    const url = matchedText.replace(trailingPunctuationPattern, '')
    const trailingText = matchedText.slice(url.length)

    if (start > cursor) parts.push(text.slice(cursor, start))

    let safe = false
    try {
      const parsed = new URL(url)
      safe = parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      safe = false
    }

    parts.push(safe ? (
      <a className="inline-content-link" href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>
    ) : url)
    if (trailingText) parts.push(trailingText)
    cursor = start + matchedText.length
  }

  if (cursor < text.length) parts.push(text.slice(cursor))

  return <>{parts.map((part, index) => <Fragment key={index}>{part}</Fragment>)}</>
}
